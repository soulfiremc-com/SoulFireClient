/// <reference types="vite/client" />
import type { SoulFireDesktopApi } from "@/lib/desktop-api";

declare global {
  const APP_VERSION: string;
  const APP_ENVIRONMENT: "production" | "development" | "preview";
  const APP_LOCALES: string;
  const APP_NAMESPACES: string;

  interface Window {
    soulfireElectron?: SoulFireDesktopApi;
  }
}

declare module "react" {
  // Components pass theme values to CSS through custom properties.
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}

declare module "*.svg" {
  const content: string;
  export default content;
}
declare module "*.svg?react" {
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
