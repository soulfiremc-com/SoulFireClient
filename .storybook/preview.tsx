import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview, ReactRenderer } from "@storybook/react-vite";
import { createInstance, type ResourceLanguage } from "i18next";
import { I18nextProvider } from "react-i18next";
import { toast } from "sonner";
import { configure, expect, waitFor } from "storybook/test";
import { Toaster } from "../src/components/ui/sonner";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/App.css";
import "./preview.css";

const translations = import.meta.glob<ResourceLanguage>(
  "../locales/en-US/*.json",
  { eager: true, import: "default" },
);
const resources = Object.fromEntries(
  Object.entries(translations).map(([path, resource]) => [
    path.slice(path.lastIndexOf("/") + 1).replace(".json", ""),
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

// Busy CI runners can need more than the default second to render and animate,
// for example when a toast fades in.
configure({ asyncUtilTimeout: 3000 });

// Give each story empty storage and put the viewer's data back afterwards.
// The Storybook manager shares this origin, and the stories of one test worker
// share a page.
function isolateStorage(storage: Storage) {
  const saved = Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index) ?? "";
    return [key, storage.getItem(key) ?? ""] as const;
  });
  storage.clear();
  return () => {
    storage.clear();
    for (const [key, value] of saved) storage.setItem(key, value);
  };
}

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    a11y: { test: "error" },
    controls: { matchers: { color: /(background|color)$/iu, date: /Date$/u } },
  },
  beforeEach: () => {
    const restoreLocal = isolateStorage(localStorage);
    const restoreSession = isolateStorage(sessionStorage);
    return () => {
      restoreLocal();
      restoreSession();
    };
  },
  // Remove toasts while the story is still mounted, so none reach the next one.
  afterEach: async () => {
    toast.dismiss();
    await waitFor(() =>
      expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(0),
    );
  },
  decorators: [
    withThemeByClassName<ReactRenderer>({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <Story />
          <Toaster />
        </TooltipProvider>
      </I18nextProvider>
    ),
  ],
};

export default preview;
