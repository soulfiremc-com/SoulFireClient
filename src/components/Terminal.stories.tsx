import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toTerminalLine } from "@/stores/terminal-log-store";
import { TerminalView } from "./terminal";

const writeClipboard = fn(async (_text: string) => {});
const uploadLog = fn(async (_body: BodyInit | null | undefined) =>
  Response.json({ success: true, url: "https://mclo.gs/test-log" }),
);
const entries = Array.from({ length: 100 }, (_, id) =>
  toTerminalLine({
    id: String(id),
    message: id === 99 ? "\x1b[31mLast log\x1b[0m" : `Log ${id}`,
    personal: false,
  }),
);

function TerminalHarness() {
  const [logs, setLogs] = useState(entries);
  const [theme, setTheme] = useState("mocha");
  const [narrow, setNarrow] = useState(false);
  return (
    <div className={narrow ? "w-80" : "w-full"}>
      <div className="flex gap-2">
        <Button
          onClick={() =>
            setLogs((current) => [
              ...current,
              toTerminalLine({
                id: "new",
                message: "New log",
                personal: false,
              }),
            ])
          }
        >
          Append
        </Button>
        <Button onClick={() => setLogs((current) => current.slice(1))}>
          Trim
        </Button>
        <Button
          onClick={() =>
            setLogs([
              toTerminalLine({
                id: "scope",
                message: "Other scope",
                personal: false,
              }),
            ])
          }
        >
          Change scope
        </Button>
        <Button onClick={() => setTheme("latte")}>Change theme</Button>
        <Button onClick={() => setNarrow((value) => !value)}>Resize</Button>
      </div>
      <TerminalView entries={logs} theme={theme} />
      <Toaster />
    </div>
  );
}

const meta = {
  title: "Terminal/Log output",
  component: TerminalView,
  args: { entries, theme: "mocha" },
  render: () => <TerminalHarness />,
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalFetch = window.fetch;
    writeClipboard.mockClear();
    uploadLog.mockClear();
    window.fetch = (input, init) =>
      input === "https://api.mclo.gs/1/log"
        ? uploadLog(init?.body)
        : originalFetch(input, init);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboard },
    });
    return () => {
      toast.dismiss();
      window.fetch = originalFetch;
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
} satisfies Meta<typeof TerminalView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ScrollAndReconcile: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const host = canvasElement.querySelector<HTMLElement>(
      "[data-terminal-viewport]",
    )!;
    // Allow the terminal's WASM core to initialize alongside other stories.
    await waitFor(() => expect(host).toHaveTextContent("Last log"), {
      timeout: 5000,
    });
    await waitFor(() => expect(host.scrollTop).toBeGreaterThan(0));
    host.scrollTop = 300;
    host.dispatchEvent(new Event("scroll"));
    await userEvent.click(canvas.getByRole("button", { name: "Append" }));
    await waitFor(() => expect(host.scrollTop).toBeCloseTo(300, 0));
    await userEvent.click(canvas.getByRole("button", { name: "Trim" }));
    await waitFor(() => expect(host.scrollTop).toBeLessThan(300));
    expect(host.scrollTop).toBeGreaterThan(270);
    host.scrollTop = host.scrollHeight;
    host.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(host).toHaveTextContent("New log"));
    const background = getComputedStyle(host).backgroundColor;
    await userEvent.click(canvas.getByRole("button", { name: "Change theme" }));
    await waitFor(() =>
      expect(getComputedStyle(host).backgroundColor).not.toBe(background),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Resize" }));
    await waitFor(() => expect(host.clientWidth).toBeLessThan(400));
    await waitFor(() => expect(host).toHaveTextContent("New log"));
    await userEvent.click(canvas.getByRole("button", { name: "Change scope" }));
    await waitFor(() => expect(host).toHaveTextContent("Other scope"));
    expect(host).not.toHaveTextContent("Last log");
  },
};

export const SelectAndCopy: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const host = canvasElement.querySelector<HTMLElement>(
      "[data-terminal-viewport]",
    )!;
    await waitFor(() => expect(host).toHaveTextContent("Last log"));
    const input = host.querySelector("textarea")!;
    expect(input).toHaveAttribute("readonly");
    expect(input).not.toHaveFocus();
    input.focus();
    await userEvent.keyboard("ignored input");
    expect(host).not.toHaveTextContent("ignored input");
    await userEvent.keyboard("{Control>}a{/Control}");
    await waitFor(() => expect(host).toHaveClass("term-select-all"));
    await userEvent.pointer({ target: host, keys: "[MouseRight]" });
    const copy = await within(document.body).findByRole("menuitem", {
      name: "Copy to clipboard",
    });
    await userEvent.click(copy);
    await waitFor(() => expect(writeClipboard).toHaveBeenCalled());
    expect(writeClipboard.mock.calls[0][0]).toContain("Log 0\nLog 1");
    expect(writeClipboard.mock.calls[0][0]).toContain("Last log");
    expect(writeClipboard.mock.calls[0][0]).not.toContain("\x1b");
    await userEvent.click(host);
    const lastLog = within(host).getByText("Last log");
    const range = host.ownerDocument.createRange();
    range.selectNodeContents(lastLog);
    const selection = host.ownerDocument.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe("Last log");
    await userEvent.pointer({ target: lastLog, keys: "[MouseRight]" });
    await userEvent.click(
      await within(document.body).findByRole("menuitem", {
        name: "Upload to mclo.gs",
      }),
    );
    await waitFor(() => expect(uploadLog).toHaveBeenCalled());
    expect(
      new URLSearchParams(String(uploadLog.mock.calls[0][0])).get("content"),
    ).toBe("Last log");
    await waitFor(() =>
      expect(writeClipboard).toHaveBeenLastCalledWith(
        "https://mclo.gs/test-log",
      ),
    );
  },
};
