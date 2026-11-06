import * as fs from "node:fs";
import { devtools } from "@tanstack/devtools-vite";
import posthog from "@posthog/rollup-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import svgr from "vite-plugin-svgr";
import { getBuildEnvironment } from "./src/lib/build-environment.ts";

const appEnv = getBuildEnvironment(process.env);

const locales = fs
  .readdirSync("./locales", { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .join(",");

const namespaces = fs
  .readdirSync("./locales/en-US", { withFileTypes: true })
  .filter((dirent) => dirent.isFile())
  .map((dirent) => dirent.name.split(".")[0])
  .join(",");

const isDev = appEnv === "development";
const isElectron = process.env.SF_ELECTRON === "1";
const desktopCsp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' 'unsafe-eval' https://tc.soulfiremc.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; connect-src 'self' https://tc.soulfiremc.com https://api.mclo.gs *; font-src 'self'; frame-src 'self'; img-src 'self' data: blob: https://www.gravatar.com https://mc-heads.net https://assets.mcasset.cloud; manifest-src 'self'; media-src 'self'; worker-src 'self' blob:;";

export default defineConfig({
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
    APP_ENVIRONMENT: JSON.stringify(appEnv),
    APP_LOCALES: JSON.stringify(locales),
    APP_NAMESPACES: JSON.stringify(namespaces),
  },
  plugins: [
    devtools({
      eventBusConfig: {
        // Disabled on Windows due to hang issue with ServerEventBus.start()
        enabled: process.platform !== "win32",
      },
    }),
    ...(isElectron
      ? [
          electron({
            main: {
              entry: "electron/main.ts",
              vite: {
                build: {
                  lib: {
                    formats: ["cjs"],
                  },
                  rolldownOptions: {
                    output: {
                      entryFileNames: "[name].cjs",
                    },
                  },
                },
              },
            },
            preload: {
              input: "electron/preload.ts",
            },
          }),
        ]
      : []),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: !isDev,
    }),
    react(),
    // babel({ presets: [reactCompilerPreset()] }),
    svgr(),
    ...(!isDev && process.env.POSTHOG_PERSONAL_API_KEY
      ? [
          posthog({
            personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
            projectId: "274904",
            host: "https://eu.posthog.com",
            sourcemaps: {
              enabled: true,
              releaseName: "SoulFireClient",
              releaseVersion:
                process.env.GITHUB_SHA ?? process.env.npm_package_version,
              deleteAfterUpload: false,
            },
          }),
        ]
      : []),
  ],
  clearScreen: false,
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: false,
    port: 1420,
    strictPort: true,
    headers: {
      "X-DNS-Prefetch-Control": "on",
      "X-XSS-Protection": "1; mode=block",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": desktopCsp,
    },
    watch: {
      ignored: ["**/target/**", "**/.idea/**"],
    },
  },
  envPrefix: ["VITE_", "SF_"],
  build: {
    target: isElectron ? "chrome128" : "es2020",
    minify: "esbuild",
    sourcemap: true,
    rolldownOptions: {
      checks: {
        circularDependency: true,
      },
      output: {
        strictExecutionOrder: true,
      },
    },
  },
});
