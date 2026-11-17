import { defineConfig } from "cf/config";
import * as entrypoint from "./worker/index.ts" with { type: "cf-worker" };

// Each release channel is one Worker that serves its app and demo hostnames.
// The hostname alone turns on demo mode, so both share one build.
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
      entrypoint,
      assets: {
        // Page loads that match no file get index.html. Other misses run the
        // Worker, which answers 404.
        notFoundHandling: "single-page-application",
      },
    },
  };
});
