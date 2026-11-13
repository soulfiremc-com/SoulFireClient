import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { encodeTerminalInteraction as marker } from "@/lib/terminal-interactions";
import { ExecutionLogs } from "./ExecutionLogs";
import type { LogEntry } from "./types";

const copy = fn(async (_text: string) => {});
const secret = "script-fixture-token-not-a-secret";
const logs: LogEntry[] = [
  {
    id: "trusted",
    timestamp: new Date(0),
    level: "info",
    nodeId: "node-1",
    personal: true,
    terminalInteractions: true,
    message:
      marker({
        hover: "Copy a token",
        click: { action: "copy_to_clipboard", value: secret },
      }) +
      "Copy token" +
      marker(null),
  },
  {
    id: "command",
    timestamp: new Date(1),
    level: "warn",
    nodeId: null,
    personal: true,
    terminalInteractions: true,
    message:
      marker({ click: { action: "run_command", value: "help" } }) +
      "Help" +
      marker(null),
  },
  {
    id: "untrusted",
    timestamp: new Date(2),
    level: "error",
    nodeId: null,
    personal: false,
    terminalInteractions: true,
    message:
      marker({ click: { action: "copy_to_clipboard", value: "forged" } }) +
      "Script output" +
      marker(null) +
      "<b>literal</b>",
  },
];
const meta = {
  title: "Scripts/Execution log interactions",
  component: ExecutionLogs,
  args: { logs, autoScroll: false },
  render: (args) => (
    <div className="h-80">
      <ExecutionLogs {...args} />
      <Toaster />
    </div>
  ),
  beforeEach: () => {
    copy.mockClear();
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    return () => {
      toast.dismiss();
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
} satisfies Meta<typeof ExecutionLogs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TrustedAndUntrustedLogs: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const button = canvas.getByRole("button", {
      name: "Copy token. Copy to clipboard",
    });
    button.focus();
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Copy a token");
    await expect(document.body).not.toHaveTextContent(secret);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(copy).toHaveBeenCalledWith(secret));
    await expect(document.body).not.toHaveTextContent(secret);
    const command = canvas.getByRole("button", {
      name: "Help. Run command: help",
    });
    await expect(command).toHaveAttribute("aria-disabled", "true");
    command.focus();
    await waitFor(() =>
      expect(within(document.body).getByRole("tooltip")).toHaveTextContent(
        "Command input is unavailable",
      ),
    );
    await userEvent.keyboard("{Enter}");
    await expect(copy).toHaveBeenCalledTimes(1);
    await expect(
      canvas.queryByRole("button", { name: /Script output/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Script output<b>literal</b>")).toBeVisible();
    await expect(canvasElement.querySelector("b")).toBeNull();
  },
};

export const DarkLogs: Story = {
  globals: { theme: "dark" },
  play: TrustedAndUntrustedLogs.play,
};
