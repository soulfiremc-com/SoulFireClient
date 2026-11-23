import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";

/**
 * Splits imported text into one payload per account. Cookie jars and
 * Cookie-Editor exports span several lines, so blank lines separate those
 * accounts. Every other format has one account per line.
 */
export function splitAccountCredentialPayloads(
  text: string,
  accountType: AccountTypeCredentials,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  if (
    accountType === AccountTypeCredentials.MICROSOFT_JAVA_COOKIES &&
    (looksLikeCookieJar(trimmed) || looksLikeCookieEditorJson(trimmed))
  ) {
    return trimmed
      .split(/\r?\n(?:[ \t]*\r?\n)+/u)
      .map((payload) => payload.trim())
      .filter((payload) => payload.length > 0 && !isCommentBlock(payload));
  }

  return trimmed
    .split(/\r?\n/u)
    .map((payload) => payload.trim())
    .filter((payload) => payload.length > 0);
}

// Netscape cookie files start with a comment header and a blank line. Lines
// that start with "#HttpOnly_" are cookies, not comments.
function isCommentBlock(payload: string) {
  return payload
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .every(
      (line) =>
        line.length === 0 ||
        (line.startsWith("#") && !line.startsWith("#HttpOnly_")),
    );
}

function looksLikeCookieJar(input: string) {
  const hasLiveCookieMarker =
    input.includes("__Host-MSAAUTHP") ||
    input.includes("login.live.com") ||
    input.includes("\tMSPAuth\t") ||
    input.includes("\tMSPProf\t") ||
    input.includes("\tPPLState\t");
  return input.includes("\t") && hasLiveCookieMarker;
}

function looksLikeCookieEditorJson(input: string) {
  return (
    input.startsWith("[") &&
    input.endsWith("]") &&
    input.includes('"name"') &&
    input.includes('"value"')
  );
}
