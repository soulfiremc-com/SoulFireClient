import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import { version } from "../package.json";

const namespaces = readdirSync(new URL("../locales/en-US", import.meta.url))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5));

// Keep Electron, route generation, and application devtools out of Storybook.
export default defineConfig({
  plugins: [svgr()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  define: {
    APP_VERSION: JSON.stringify(version),
    APP_ENVIRONMENT: JSON.stringify("development"),
    APP_LOCALES: JSON.stringify("en-US"),
    APP_NAMESPACES: JSON.stringify(namespaces.join(",")),
  },
});
