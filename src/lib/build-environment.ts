// The Vite mode selects the release channel. Cloudflare preview deploys build
// with `--mode preview`; local dev uses `development`; other builds are production.
export function getBuildEnvironment(mode: string): typeof APP_ENVIRONMENT {
  return mode === "preview" || mode === "development" ? mode : "production";
}
