import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview, Renderer } from "@storybook/react-vite";
import { createInstance, type ResourceLanguage } from "i18next";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/App.css";
import "./preview.css";

const translations = import.meta.glob<ResourceLanguage>(
  "../locales/en-US/*.json",
  { eager: true, import: "default" },
);
const resources = Object.fromEntries(
  Object.entries(translations).map(([path, resource]) => [
    path.split("/").at(-1)!.replace(".json", ""),
    resource,
  ]),
);

// Use real translations without the app's language detector or remote backend.
const i18n = createInstance();
void i18n.init({
  lng: "en-US",
  fallbackLng: "en-US",
  defaultNS: "common",
  resources: { "en-US": resources },
  initAsync: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
});

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
  decorators: [
    withThemeByClassName<Renderer>({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </I18nextProvider>
    ),
  ],
};

export default preview;
