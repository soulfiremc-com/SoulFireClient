import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { cdp, userEvent as browserUser } from "@vitest/browser/context";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
  CategoryDefinitionSchema,
  GetNodeTypesResponseSchema,
  NodeTypeDefinitionSchema,
  PortDefinitionSchema,
  PortType,
} from "@/generated/soulfire/script_pb";
import { nodeTypesQueryOptions } from "@/lib/script-service";
import {
  createScriptEditorSession,
  type ScriptEditorSession,
} from "@/stores/script-editor-store";
import { NodeTypesProvider } from "./NodeTypesContext";
import { ScriptEditor } from "./ScriptEditor";
import { ScriptEditorProvider } from "./ScriptEditorProvider";
import { initNodeDefinitions, protoNodeTypeToLocal } from "./nodes/types";
import "@xyflow/react/dist/style.css";

const port = (
  id: string,
  portType: PortType,
  extra: { defaultValue?: string } = {},
) =>
  create(PortDefinitionSchema, {
    id,
    displayName: id[0].toUpperCase() + id.slice(1),
    portType,
    ...extra,
  });

const definitions = [
  create(NodeTypeDefinitionSchema, {
    type: "test.source",
    displayName: "Source",
    category: "test",
    outputs: [port("value", PortType.NUMBER), port("entity", PortType.ENTITY)],
  }),
  create(NodeTypeDefinitionSchema, {
    type: "test.sink",
    displayName: "Sink",
    category: "test",
    inputs: [
      port("amount", PortType.NUMBER, { defaultValue: "5" }),
      port("position", PortType.VECTOR3, {
        defaultValue: '{"x":1,"y":2,"z":3}',
      }),
    ],
  }),
];

let session: ScriptEditorSession;
let sourceId: string;
let sinkId: string;

function ScriptCanvasExample() {
  const [editor] = useState(() => {
    session = createScriptEditorSession();
    sourceId = session.actions.addNode("test.source", { x: 0, y: 0 });
    sinkId = session.actions.addNode("test.sink", { x: 320, y: 0 });
    return session;
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
    <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
      <QueryClientProvider client={client}>
        <ScriptEditorProvider session={editor}>
          <ReactFlowProvider>
            <NodeTypesProvider>
              <div className="h-dvh w-full">
                <ScriptEditor />
              </div>
            </NodeTypesProvider>
          </ReactFlowProvider>
        </ScriptEditorProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function handle(nodeId: string, handleId: string) {
  return document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${nodeId}"] .react-flow__handle[data-handleid="${handleId}"]`,
  )!;
}

function center(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
  };
}

/** Drags a wire with mouse events, the way React Flow listens for them. */
async function dragWire(
  from: HTMLElement,
  to: { clientX: number; clientY: number },
) {
  const start = center(from);
  const init = { bubbles: true, button: 0, buttons: 1 };
  from.dispatchEvent(new MouseEvent("mousedown", { ...init, ...start }));
  for (const step of [0.25, 0.5, 0.75, 1]) {
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        ...init,
        clientX: start.clientX + (to.clientX - start.clientX) * step,
        clientY: start.clientY + (to.clientY - start.clientY) * step,
      }),
    );
    await new Promise(requestAnimationFrame);
  }
  document.dispatchEvent(new MouseEvent("mouseup", { ...init, ...to }));
}

const viewport = () =>
  document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform;

/** Waits until the first fit has moved the nodes into view. */
async function canvasReady() {
  let last: string | undefined;
  await waitFor(async () => {
    await expect(handle(sinkId, "amount")).toBeTruthy();
    const current = viewport();
    const settled =
      current === last && current !== "translate(0px, 0px) scale(1)";
    last = current;
    await expect(settled).toBe(true);
  });
}

const meta = {
  title: "Scripts/Canvas",
  component: ScriptCanvasExample,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    initNodeDefinitions(definitions.map(protoNodeTypeToLocal));
    // A stored dark theme must not leak into the canvas while the page is
    // forced to light. Other stories can leave one behind in CI.
    const storedTheme = localStorage.getItem("theme");
    localStorage.setItem("theme", "dark");
    return () => {
      if (storedTheme === null) localStorage.removeItem("theme");
      else localStorage.setItem("theme", storedTheme);
    };
  },
} satisfies Meta<typeof ScriptCanvasExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DragConnectsMatchingPorts: Story = {
  play: async () => {
    await canvasReady();
    // Playwright moves the real mouse, so this covers native pointer handling.
    await browserUser.dragAndDrop(
      handle(sourceId, "value"),
      handle(sinkId, "amount"),
    );
    await waitFor(() =>
      expect(session.document.get().edges).toEqual([
        expect.objectContaining({
          source: sourceId,
          sourceHandle: "value",
          target: sinkId,
          targetHandle: "amount",
        }),
      ]),
    );
    // A connected input hides its inline field.
    await expect(
      within(document.body).queryByRole("spinbutton", { name: "Amount" }),
    ).toBeNull();
  },
};

export const DragExplainsWrongPortType: Story = {
  play: async () => {
    await canvasReady();
    await dragWire(
      handle(sourceId, "entity"),
      center(handle(sinkId, "amount")),
    );
    await within(document.body).findByText(
      "You cannot connect entity outputs to number inputs.",
    );
    await expect(session.document.get().edges).toEqual([]);
  },
};

export const DragToEmptyCanvasOpensQuickAdd: Story = {
  play: async () => {
    await canvasReady();
    const from = center(handle(sourceId, "value"));
    await dragWire(handle(sourceId, "value"), {
      clientX: from.clientX + 120,
      clientY: from.clientY + 260,
    });
    await within(document.body).findByRole("dialog", {
      name: "Quick add node menu",
    });
  },
};

export const Vector3DefaultsAreEditable: Story = {
  play: async ({ userEvent }) => {
    await canvasReady();
    const body = within(document.body);
    const y = await body.findByRole("spinbutton", { name: "Position Y" });
    await expect(
      body.getByRole("spinbutton", { name: "Position X" }),
    ).toHaveValue(1);
    await expect(y).toHaveValue(2);
    await expect(
      body.getByRole("spinbutton", { name: "Position Z" }),
    ).toHaveValue(3);
    await userEvent.clear(y);
    await userEvent.type(y, "7");
    await waitFor(() =>
      expect(
        session.document.get().nodes.find((node) => node.id === sinkId)?.data
          .position,
      ).toEqual({ x: 1, y: 7, z: 3 }),
    );
  },
};

export const NodeBadgesOpenOnTap: Story = {
  play: async ({ userEvent }) => {
    await canvasReady();
    session.actions.setValidationDiagnostics([
      {
        nodeId: sinkId,
        edgeId: "",
        message: "Amount must be positive.",
        severity: "error",
      },
      {
        nodeId: sinkId,
        edgeId: "",
        message: "Position is far away.",
        severity: "warning",
      },
    ]);
    session.actions.addNodeExecutionTime(sinkId, 12.4);
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: "1 error, 1 warning" }),
    );
    await body.findByText("Amount must be positive.");
    await body.findByText("Position is far away.");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      body.getByRole("button", { name: "12ms average run time" }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="popover-content"]'),
      ).toHaveTextContent("Average execution time: 12.40 ms (last 1 runs)"),
    );
  },
};

/** Drags a wire with touch events and drops it near, not on, the port dot. */
async function touchWire(from: HTMLElement, to: HTMLElement, offset: number) {
  const point = (element: HTMLElement) => {
    const { clientX, clientY } = center(element);
    return { clientX: clientX + offset, clientY: clientY + offset };
  };
  const start = point(from);
  const end = point(to);
  const startTarget = document.elementFromPoint(start.clientX, start.clientY)!;
  const touch = (at: { clientX: number; clientY: number }) =>
    new Touch({ identifier: 1, target: startTarget, ...at });
  startTarget.dispatchEvent(
    new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [touch(start)],
      changedTouches: [touch(start)],
    }),
  );
  for (const step of [0.25, 0.5, 0.75, 1]) {
    const at = {
      clientX: start.clientX + (end.clientX - start.clientX) * step,
      clientY: start.clientY + (end.clientY - start.clientY) * step,
    };
    document.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [touch(at)],
        changedTouches: [touch(at)],
      }),
    );
    await new Promise(requestAnimationFrame);
  }
  document.dispatchEvent(
    new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      touches: [],
      changedTouches: [touch(end)],
    }),
  );
}

export const TouchConnectsWithLargerTargets: Story = {
  beforeEach: async () => {
    // Touch emulation makes the primary pointer coarse.
    await cdp().send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    return async () => {
      await cdp().send("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      });
    };
  },
  play: async () => {
    await canvasReady();
    await expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    // 8 px from the center lands outside the 8 px dot but inside its touch area.
    await touchWire(handle(sourceId, "value"), handle(sinkId, "amount"), 8);
    await waitFor(() =>
      expect(session.document.get().edges).toEqual([
        expect.objectContaining({
          source: sourceId,
          sourceHandle: "value",
          target: sinkId,
          targetHandle: "amount",
        }),
      ]),
    );
  },
};
