import type { JsonValue } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import {
  createSettingsRegistry,
  SettingsRegistryContext,
} from "@/components/providers/settings-registry-context";
import { ClientSettingsPageComponent } from "@/components/settings-page";
import {
  demoInstanceSettings,
  demoInstanceSettingsDefinitions,
} from "@/demo-data";
import type { BaseSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

function SettingsFormExample({
  pageId,
  compact,
  persisted,
  failSave,
  disabled,
  onSave,
  focusKey,
  invalidCombo,
  emptyCombo,
}: {
  pageId: string;
  compact: boolean;
  persisted: boolean;
  failSave: boolean;
  disabled: boolean;
  onSave: (namespace: string, key: string, value: JsonValue) => void;
  focusKey?: string;
  invalidCombo?: boolean;
  emptyCombo?: boolean;
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [config, setConfig] = useState<BaseSettings>({
    settings: invalidCombo
      ? { bot: { "protocol-version": "removed-version" } }
      : {},
  });
  const definitions = useMemo(() => {
    const result = structuredClone(demoInstanceSettingsDefinitions);
    for (const definition of result) {
      if (definition.type.value) definition.type.value.disabled = disabled;
      if (emptyCombo && definition.type.case === "combo")
        definition.type.value.options = [];
    }
    return result;
  }, [disabled, emptyCombo]);
  const registry = useMemo(
    () => createSettingsRegistry(definitions),
    [definitions],
  );
  const page = demoInstanceSettings.find((entry) => entry.id === pageId)!;
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsRegistryContext value={registry}>
        <div className={cn("w-full", compact ? "max-w-sm" : "max-w-5xl")}>
          <ClientSettingsPageComponent
            data={page}
            definitions={definitions}
            allPages={demoInstanceSettings}
            config={config}
            mutationTarget={{ type: "instance", instanceId: "settings-story" }}
            persisted={persisted}
            focusSetting={
              focusKey ? { namespace: pageId, key: focusKey } : undefined
            }
            invalidateQuery={async () => {}}
            updateConfigEntry={async (namespace, key, value) => {
              onSave(namespace, key, value);
              if (failSave) throw new Error("The server is unavailable");
              setConfig((current) => ({
                settings: {
                  ...current.settings,
                  [namespace]: { ...current.settings[namespace], [key]: value },
                },
              }));
            }}
            linkToPage={(target, label) => (
              <a href={`#${target.id}`}>{label}</a>
            )}
          />
        </div>
      </SettingsRegistryContext>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Settings/Page",
  component: SettingsFormExample,
  args: {
    pageId: "pathfinding",
    compact: false,
    persisted: true,
    failSave: false,
    disabled: false,
    onSave: fn(),
  },
} satisfies Meta<typeof SettingsFormExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pathfinding: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Avoid Harmful Entities",
    });
    await expect(toggle).toBeChecked();
    // Clicking the visible label must operate the switch too.
    await userEvent.click(canvas.getByText("Avoid Harmful Entities"));
    await expect(toggle).not.toBeChecked();
    await expect(args.onSave).toHaveBeenLastCalledWith(
      "pathfinding",
      "avoid-harmful-entities",
      false,
    );
    const row = toggle.closest('[data-slot="field"]')!.parentElement!;
    await userEvent.click(
      within(row).getByRole("button", { name: "Reset to default" }),
    );
    await expect(toggle).toBeChecked();
    await expect(args.onSave).toHaveBeenLastCalledWith(
      "pathfinding",
      "avoid-harmful-entities",
      true,
    );
  },
};

export const AI: Story = {
  args: { pageId: "ai" },
  play: async ({ canvas, userEvent }) => {
    const key = canvas.getByLabelText("API Key");
    const row = key.closest('[data-slot="field"]')!.parentElement!;
    // An empty password default must not leave a blank status row behind.
    await expect(row.querySelector('[data-slot="setting-status"]')).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter this page" }),
    );
    await userEvent.type(canvas.getByRole("searchbox"), "retries");
    await expect(
      canvas.getByRole("textbox", { name: "API Max Retries" }),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("API Key")).not.toBeInTheDocument();
    await userEvent.clear(canvas.getByRole("searchbox"));
    await userEvent.type(canvas.getByRole("searchbox"), "harmful");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No settings on this page",
    );
    await expect(
      canvas.getByRole("link", { name: /Pathfinding Settings/ }),
    ).toBeVisible();
  },
};

export const StackedOnWideScreens: Story = {
  args: { pageId: "ai" },
  play: async ({ canvas }) => {
    const label = canvas.getByText("API Base URL").getBoundingClientRect();
    const input = canvas.getByLabelText("API Base URL").getBoundingClientRect();
    const description = canvas
      .getByText("API server base URL, can also be changed to other providers")
      .getBoundingClientRect();
    await expect(input.top).toBeGreaterThan(description.bottom);
    await expect(input.left).toBe(label.left);
  },
};

export const AdvancedSettings: Story = {
  args: { pageId: "bot" },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("switch", { name: "Resolve SRV" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Advanced/ }));
    await expect(
      canvas.getByRole("switch", { name: "Resolve SRV" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter this page" }),
    );
    await userEvent.type(canvas.getByRole("searchbox"), "read timeout");
    await expect(
      canvas.getByRole("textbox", { name: "Read Timeout" }),
    ).toBeVisible();
  },
};

export const FocusedAdvancedSetting: Story = {
  args: { pageId: "bot", focusKey: "read-timeout" },
  play: async ({ args, canvas, userEvent }) => {
    const control = canvas.getByRole("textbox", { name: "Read Timeout" });
    await expect(control).toBeVisible();
    await waitFor(() => expect(control).toHaveFocus());
    await expect(
      canvas.getByRole("group", { name: "Read Timeout" }),
    ).toHaveAttribute("data-setting-focused", "true");
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter this page" }),
    );
    await expect(
      canvas.getByRole("searchbox", { name: "Filter this page" }),
    ).toHaveFocus();
  },
};

export const OptionalPageFilter: Story = {
  play: async ({ canvas, userEvent }) => {
    // The page opens without a filter field, and every setting is shown.
    await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
    await expect(canvas.getByText("Changes save automatically.")).toBeVisible();
    const open = canvas.getByRole("button", { name: "Filter this page" });
    await userEvent.click(open);
    const input = canvas.getByRole("searchbox", { name: "Filter this page" });
    await expect(input).toHaveFocus();
    // Descriptions match as well as names.
    await userEvent.type(input, "hostile mobs");
    await expect(
      canvas.getByRole("switch", { name: "Avoid Harmful Entities" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("switch", { name: "Disable Pruning" }),
    ).not.toBeInTheDocument();
    // Escape clears the text first and keeps the field open.
    await userEvent.keyboard("{Escape}");
    await expect(input).toHaveValue("");
    await expect(input).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Disable Pruning" }),
    ).toBeVisible();
    await userEvent.type(input, "harmful");
    // Closing the filter also clears it, so no setting stays hidden.
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear and close filter" }),
    );
    await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("switch", { name: "Disable Pruning" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Filter this page" }),
      ).toHaveFocus(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter this page" }),
    );
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
  },
};

export const Compact: Story = {
  args: { pageId: "ai", compact: true },
  play: async ({ canvas, canvasElement }) => {
    const label = canvas.getByText("API Base URL").getBoundingClientRect();
    const input = canvas.getByLabelText("API Base URL").getBoundingClientRect();
    await expect(input.top).toBeGreaterThan(label.bottom);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    );
  },
};

export const SaveFailure: Story = {
  args: { failSave: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("switch", { name: "Avoid Harmful Entities" }),
    );
    await expect(canvas.getByText("Not saved")).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Avoid Harmful Entities" }),
    ).toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", {
      name: "Avoid Harmful Entities",
    });
    await expect(toggle).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(canvas.getByText("Avoid Harmful Entities"));
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

export const Demo: Story = {
  args: { persisted: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("The demo does not save changes."),
    ).toBeVisible();
    await expect(
      canvas.queryByText("Changes save automatically."),
    ).not.toBeInTheDocument();
  },
};

export const UnknownSavedOption: Story = {
  args: { pageId: "bot", invalidCombo: true, failSave: true },
  play: async ({ args, canvas, userEvent, canvasElement }) => {
    const combo = canvas.getByRole("combobox", { name: "Protocol Version" });
    await expect(combo).toHaveTextContent("Select an option");
    await expect(args.onSave).not.toHaveBeenCalled();
    await userEvent.click(combo);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole("option", { name: /1.21.11/ }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    await expect(args.onSave).toHaveBeenCalledWith(
      "bot",
      "protocol-version",
      "RELEASE|774",
    );
    await expect(combo).toHaveTextContent("Select an option");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { hidden: true }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const EmptyOptions: Story = {
  args: { pageId: "bot", emptyCombo: true },
  play: async ({ args, canvas }) => {
    const combo = canvas.getByRole("combobox", { name: "Protocol Version" });
    await expect(combo).toBeDisabled();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};
