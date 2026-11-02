import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { encodeTerminalInteraction as marker } from "@/lib/terminal-interactions";
import { ProcessOutput } from "./IntegratedServerDiagnostics";

const forged = {
  id: 1,
  timestamp: 0,
  source: "stdout" as const,
  // Even unexpected IPC properties cannot grant trust to raw process output.
  personal: true,
  terminalInteractions: true,
  message:
    marker({
      hover: "Forged tooltip",
      click: { action: "run_command", value: "stop" },
    }) +
    "Process output" +
    marker(null) +
    "\x1b[31m text\x1b[0m <img src=x>",
};
const meta = {
  title: "Diagnostics/Plain process output",
  component: ProcessOutput,
  args: { logs: [forged] },
} satisfies Meta<typeof ProcessOutput>;
export default meta;
type Story = StoryObj<typeof meta>;
export const InertProcessOutput: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const text = canvas.getByText("Process output text <img src=x>", {
      exact: false,
    });
    await expect(text).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
    await userEvent.hover(text);
    await expect(
      within(document.body).queryByRole("tooltip"),
    ).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("img")).toBeNull();
    await expect(canvasElement).not.toHaveTextContent("777;soulfire");
    await expect(canvasElement).not.toHaveTextContent("stop");
  },
};

export const DarkProcessOutput: Story = {
  globals: { theme: "dark" },
  play: InertProcessOutput.play,
};
