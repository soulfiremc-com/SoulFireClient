/// <reference types="vite/client" />
import type { SoulFireDesktopApi } from "@/lib/desktop-api";

declare global {
  interface ImportMetaEnv {
    readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
    readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  }

  const APP_VERSION: string;
  const APP_ENVIRONMENT: "production" | "development" | "preview";
  const APP_LOCALES: string;
  const APP_NAMESPACES: string;

  interface Window {
    soulfireElectron?: SoulFireDesktopApi | undefined;
  }
}

declare module "react" {
  // Components pass theme values to CSS through custom properties.
  interface CSSProperties {
    // oxlint-disable-next-line typescript/consistent-indexed-object-style -- module augmentation must be an interface to merge with React's CSSProperties
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
