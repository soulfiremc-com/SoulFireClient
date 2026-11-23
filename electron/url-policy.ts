export const APP_PROTOCOL = "app";
export const APP_PROTOCOL_HOST = "soulfire";

/**
 * True for pages that may use the desktop API: the packaged app protocol and,
 * in development, the Vite dev server origin.
 */
export function isAllowedRendererUrl(
  target: string,
  devServerUrl: URL | null,
): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(target);
  } catch {
    return false;
  }
  if (
    parsedUrl.protocol === `${APP_PROTOCOL}:` &&
    parsedUrl.host === APP_PROTOCOL_HOST
  ) {
    return true;
  }
  return devServerUrl !== null && parsedUrl.origin === devServerUrl.origin;
}

/** True for links the app may open in the system browser or mail client. */
export function isSafeExternalUrl(target: string): boolean {
  try {
    const parsedUrl = new URL(target);
    // Minecraft servers often send plain http links in chat.
    return ["http:", "https:", "mailto:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}
