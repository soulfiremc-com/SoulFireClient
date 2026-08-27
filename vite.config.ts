import * as fs from "node:fs";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";
import svgr from "vite-plugin-svgr";

const baseEnv = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
const appEnv =
  baseEnv === "production"
    ? "production"
    : baseEnv === "preview"
      ? "preview"
      : "development";

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
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; connect-src 'self' https://aptabase.pistonmaster.net https://api.mclo.gs *; font-src 'self'; frame-src 'self'; img-src 'self' data: blob: https://www.gravatar.com https://mc-heads.net https://assets.mcasset.cloud; manifest-src 'self'; media-src 'self'; worker-src 'self';";

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
    sourcemap: isDev,
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
