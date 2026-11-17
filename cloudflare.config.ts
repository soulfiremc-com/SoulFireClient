import { defineConfig } from "cf/config";

// Each release channel is an assets-only Worker that serves its app and demo
// hostnames. The hostname alone turns on demo mode, so both share one build.
const channels = {
  production: {
    name: "soulfire-client",
    domains: ["app.soulfiremc.com", "demo.soulfiremc.com"],
  },
  preview: {
    name: "soulfire-client-preview",
    domains: ["preview.soulfiremc.com", "preview-demo.soulfiremc.com"],
  },
};

export default defineConfig(({ mode, isPreview }) => {
  const channel = channels[mode === "preview" ? "preview" : "production"];
  return {
    accountId: "4dd0e72d7bf89402be905fb40cdb230a",
    worker: {
      name: channel.name,
      // Worker Previews get their own URL and never claim the channel domains.
      domains: isPreview ? [] : channel.domains,
      compatibilityDate: "2026-04-10",
      assets: {
        // Paths that match no file get index.html, so client-side routes work.
        notFoundHandling: "single-page-application",
      },
    },
  };
});
