import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { page } from "@vitest/browser/context";
import { Button } from "@/components/ui/button";
import {
  CategoryDefinitionSchema,
  GetNodeTypesResponseSchema,
  NodeTypeDefinitionSchema,
} from "@/generated/soulfire/script_pb";
import { nodeTypesQueryOptions } from "@/lib/script-service";
import { createScriptEditorSession } from "@/stores/script-editor-store";
import { DryRunDialog } from "./DryRunDialog";
import { NodeTypesProvider } from "./NodeTypesContext";
import { QuickAddMenu } from "./QuickAddMenu";
import { ScriptEditorProvider } from "./ScriptEditorProvider";
import { initNodeDefinitions, protoNodeTypeToLocal } from "./nodes/types";

const definitions = Array.from({ length: 40 }, (_, id) =>
  create(NodeTypeDefinitionSchema, {
    type: `test.${id}`,
    displayName: `Test node ${String(id).padStart(2, "0")}`,
    category: "test",
    isTrigger: id < 2,
  }),
);

function ScriptMenuExample({ kind }: { kind: "quick" | "dry-run" }) {
  const [session] = useState(() => {
    const editor = createScriptEditorSession();
    editor.actions.addNode(
      "test.0",
      { x: 0, y: 0 },
      { label: "First trigger" },
    );
    editor.actions.addNode(
      "test.1",
      { x: 100, y: 0 },
      { label: "Second trigger" },
    );
    return editor;
  });
  const [client] = useState(() => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      nodeTypesQueryOptions(null).queryKey,
      create(GetNodeTypesResponseSchema, {
        nodeTypes: definitions,
        categories: [
          create(CategoryDefinitionSchema, { id: "test", displayName: "Test" }),
        ],
        portTypeMetadata: [],
      }),
    );
    return queryClient;
  });
  return (
    <QueryClientProvider client={client}>
      <ScriptEditorProvider session={session}>
        {kind === "dry-run" ? (
          <DryRunDialog instanceId="test-instance" />
        ) : (
          <NodeTypesProvider>
            <Button
              onClick={() =>
                session.actions.openQuickAddMenu(
                  { x: 0, y: 0 },
                  { x: innerWidth - 4, y: innerHeight - 4 },
                )
              }
            >
              Open Quick Add at edge
            </Button>
            <QuickAddMenu />
          </NodeTypesProvider>
        )}
      </ScriptEditorProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Scripts/Menu layout",
  component: ScriptMenuExample,
  args: { kind: "quick" },
  beforeEach: () => initNodeDefinitions(definitions.map(protoNodeTypeToLocal)),
} satisfies Meta<typeof ScriptMenuExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const QuickAddStaysOnScreen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Quick Add at edge",
      }),
    );
    const menu = await within(document.body).findByRole("dialog", {
      name: "Quick add node menu",
    });
    await waitFor(() => {
      const rect = menu.getBoundingClientRect();
      expect(rect.right).toBeLessThanOrEqual(innerWidth - 4);
      expect(rect.bottom).toBeLessThanOrEqual(innerHeight - 4);
    });
  },
};

export const QuickAddRevealsKeyboardSelection: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Quick Add at edge",
      }),
    );
    const menu = await within(document.body).findByRole("dialog", {
      name: "Quick add node menu",
    });
    await userEvent.type(
      within(menu).getByPlaceholderText("Search nodes..."),
      "Test node",
    );
    for (let step = 0; step < 25; step++)
      await userEvent.keyboard("{ArrowDown}");
    const row = within(menu).getByRole("button", {
      name: "Test node 24",
    });
    const viewport = menu.querySelector('[data-slot="scroll-area-viewport"]')!;
    await waitFor(() => {
      const bounds = viewport.getBoundingClientRect();
      const selected = row.getBoundingClientRect();
      expect(selected.top).toBeGreaterThanOrEqual(bounds.top);
      expect(selected.bottom).toBeLessThanOrEqual(bounds.bottom);
    });
  },
};

export const QuickAddFitsSmallScreen: Story = {
  beforeEach: async () => {
    if (!page) return;
    const original = { width: innerWidth, height: innerHeight };
    await page.viewport(320, 320);
    return () => page.viewport(original.width, original.height);
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Open Quick Add at edge",
      }),
    );
    const menu = await within(document.body).findByRole("dialog", {
      name: "Quick add node menu",
    });
    await userEvent.type(
      within(menu).getByRole("textbox", { name: "Search nodes..." }),
      "Test node",
    );
    const viewport = menu.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )!;
    await waitFor(() => {
      const rect = menu.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(16);
      expect(rect.right).toBeLessThanOrEqual(innerWidth - 16);
      expect(rect.bottom).toBeLessThanOrEqual(innerHeight - 16);
      expect(rect.height).toBeLessThanOrEqual(innerHeight / 2);
      expect(viewport.clientHeight).toBeGreaterThan(0);
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    });
  },
};

export const QuickAddDarkTheme: Story = {
  ...QuickAddStaysOnScreen,
  globals: { theme: "dark" },
};

export const DryRunOptionsHaveInset: Story = {
  args: { kind: "dry-run" },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Test run",
      }),
    );
    const dialog = await within(document.body).findByRole("dialog", {
      name: "Test run",
    });
    await userEvent.click(within(dialog).getByRole("combobox"));
    const first = await within(document.body).findByRole("option", {
      name: "First trigger",
    });
    const popup = first.closest('[data-slot="select-content"]')!;
    await waitFor(() => {
      const inset =
        first.getBoundingClientRect().left - popup.getBoundingClientRect().left;
      expect(inset).toBeGreaterThanOrEqual(4);
    });
  },
};
