import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { SoulFireDesktopApi } from "@/lib/desktop-api";
import { WindowControls } from "./window-titlebar";

type WindowApi = SoulFireDesktopApi["window"];

function createWindowApi({ closed = false } = {}) {
  let maximized = false;
  let resized: (() => void) | null = null;
  const calls = { isMaximized: 0 };
  const ensureOpen = () => {
    if (closed) throw new Error("POV window is closed");
  };
  const api: WindowApi = {
    close: async () => {
      ensureOpen();
    },
    isMaximized: async () => {
      calls.isMaximized += 1;
      ensureOpen();
      return maximized;
    },
    maximize: async () => {
      ensureOpen();
      maximized = true;
    },
    minimize: async () => {
      ensureOpen();
    },
    onResized: async (callback) => {
      resized = callback;
      return () => {
        resized = null;
      };
    },
    unmaximize: async () => {
      ensureOpen();
      maximized = false;
    },
  };
  return { api, calls, resize: () => resized?.() };
}

let openWindow = createWindowApi();
let closedWindow = createWindowApi({ closed: true });

const meta = {
  title: "Window/Controls",
  component: WindowControls,
} satisfies Meta<typeof WindowControls>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  beforeEach: () => {
    openWindow = createWindowApi();
    return undefined;
  },
  render: () => <WindowControls windowApi={openWindow.api} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Maximize window" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Restore window" }),
    ).toBeVisible();
  },
};

// A POV popup can close while the controls still sync their state.
export const ClosedWindow: Story = {
  beforeEach: () => {
    closedWindow = createWindowApi({ closed: true });
    return undefined;
  },
  render: () => <WindowControls windowApi={closedWindow.api} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(closedWindow.calls.isMaximized).toBe(1));
    closedWindow.resize();
    await waitFor(() => expect(closedWindow.calls.isMaximized).toBe(2));
    await expect(
      canvas.getByRole("button", { name: "Maximize window" }),
    ).toBeVisible();
  },
};
