import { stat } from "node:fs/promises";
import path from "node:path";
import { APP_PROTOCOL, APP_PROTOCOL_HOST } from "./url-policy";

/**
 * Maps an app protocol request to a file in the renderer build. Paths without
 * an extension are app routes and get index.html. Returns null for other
 * hosts, malformed escapes, paths outside `distRoot`, and missing files.
 */
export async function resolveAppProtocolPath(
  requestUrl: string,
  distRoot: string,
): Promise<string | null> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== `${APP_PROTOCOL}:` ||
    parsedUrl.host !== APP_PROTOCOL_HOST
  ) {
    return null;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    return null;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const root = path.resolve(distRoot);
  const filePath = path.resolve(
    root,
    path.extname(relativePath) ? relativePath : "index.html",
  );

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  try {
    const fileInfo = await stat(filePath);
    return fileInfo.isFile() ? filePath : null;
  } catch {
    return null;
  }
}
