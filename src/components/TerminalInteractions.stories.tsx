import { create } from "@bufbuild/protobuf";
import { ConnectError, createRouterTransport } from "@connectrpc/connect";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context";
import {
  CommandScopeSchema,
  CommandService,
} from "@/generated/soulfire/command_pb";
import {
  encodeTerminalInteraction as marker,
  type TerminalClick,
} from "@/lib/terminal-interactions";
import { toTerminalLine } from "@/stores/terminal-log-store";
import CommandInput from "./command-input";
import { TerminalView } from "./terminal";

const commands = fn();
const copy = fn(async (_text: string) => {});
const open = fn();
const scope = create(CommandScopeSchema, {
  scope: { case: "bot", value: { instanceId: "instance-1", botId: "bot-1" } },
});
const span = (text: string, click: TerminalClick, hover?: string) =>
  marker({ click, hover }) + text + marker(null);
const entries = [
  toTerminalLine({
    id: "run",
    personal: true,
    terminalInteractions: true,
    message: span(
      "Run help",
      { action: "run_command", value: "help" },
      "Show available commands",
    ),
  }),
  toTerminalLine({
    id: "suggest",
    personal: true,
    terminalInteractions: true,
    message: span("Insert status", {
      action: "suggest_command",
      value: "status",
    }),
  }),
  toTerminalLine({
    id: "copy",
    personal: true,
    terminalInteractions: true,
    message: span("Copy text", {
      action: "copy_to_clipboard",
      value: "Héllo 🌍",
    }),
  }),
  toTerminalLine({
    id: "url",
    personal: true,
    terminalInteractions: true,
    message: span("Open website", {
      action: "open_url",
      value: "https://soulfiremc.com",
    }),
  }),
  toTerminalLine({
    id: "fail",
    personal: true,
    terminalInteractions: true,
    message: span("Run failure", { action: "run_command", value: "fail" }),
  }),
  toTerminalLine({
    id: "untrusted",
    personal: false,
    terminalInteractions: true,
    message: span("Untrusted chat", { action: "run_command", value: "stop" }),
  }),
];

function Example({
  readOnly = false,
  history = false,
}: {
  readOnly?: boolean;
  history?: boolean;
}) {
  const [narrow, setNarrow] = useState(false);
  const logs = history
    ? [
        ...Array.from({ length: 60 }, (_, id) =>
          toTerminalLine({
            id: `history-${id}`,
            message: `Log ${id}`,
            personal: false,
          }),
        ),
        toTerminalLine({
          id: "wrapped",
          personal: true,
          terminalInteractions: true,
          message: span(
            "Wrapped " + "界é ".repeat(60),
            { action: "run_command", value: "wrapped" },
            "Wrapped command",
          ),
        }),
        ...entries,
        ...Array.from({ length: 60 }, (_, id) =>
          toTerminalLine({
            id: `tail-${id}`,
            message: `Tail ${id}`,
            personal: false,
          }),
        ),
      ]
    : entries;
  const [transport] = useState(() =>
    createRouterTransport((router) =>
      router.service(CommandService, {
        executeCommand: (request) => {
          commands(request);
          if (request.command === "fail")
            throw new ConnectError("Command rejected");
          return { code: 1 };
        },
        tabCompleteCommand: () => ({ suggestions: [] }),
      }),
    ),
  );
  return (
    <TransportContext value={transport}>
      {history && (
        <button onClick={() => setNarrow((value) => !value)}>
          Resize terminal
        </button>
      )}
      <div className={narrow ? "w-80" : "w-full"}>
        <TerminalView entries={logs} theme="mocha">
          {!readOnly && <CommandInput scope={scope} />}
        </TerminalView>
      </div>
      <Toaster />
    </TransportContext>
  );
}

const meta = {
  title: "Terminal/Interactions",
  component: Example,
  beforeEach: () => {
    commands.mockClear();
    copy.mockClear();
    open.mockClear();
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const originalOpen = window.open;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    window.open = open;
    return () => {
      toast.dismiss();
      window.open = originalOpen;
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HoverAndKeyboardActions: Story = {
  play: async ({ canvas, userEvent }) => {
    const run = await canvas.findByRole("button", { name: /Run help/ });
    await userEvent.type(canvas.getByRole("combobox"), "draft");
    run.focus();
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Show available commands");
    await expect(commands).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    await expect(commands.mock.calls[0][0].scope).toEqual(scope);
    await expect(commands.mock.calls[0][0].command).toBe("help");
    await expect(canvas.getByRole("combobox")).toHaveValue("draft");
    canvas.getByRole("button", { name: /Insert status/ }).focus();
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("combobox")).toHaveFocus();
    await expect(canvas.getByRole("combobox")).toHaveValue("status");
    canvas.getByRole("button", { name: /Copy text/ }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(copy).toHaveBeenCalledWith("Héllo 🌍");
    canvas.getByRole("button", { name: /Open website/ }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(open).toHaveBeenCalledWith("https://soulfiremc.com", "_blank");
    canvas.getByRole("button", { name: /Run failure/ }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(within(document.body).getByText(/Command rejected/)).toBeVisible(),
    );
    await expect(canvas.getByRole("combobox")).toHaveValue("status");
    await expect(
      canvas.queryByRole("button", { name: /Untrusted chat/ }),
    ).not.toBeInTheDocument();
  },
};

export const PointerActionsAndSelection: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const run = await canvas.findByRole("button", { name: /Run help/ });
    const host = canvasElement.querySelector<HTMLElement>(
      "[data-terminal-viewport]",
    )!;
    const rect = run.getBoundingClientRect();
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    await userEvent.pointer({ target: host, coords });
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Show available commands");
    await expect(commands).not.toHaveBeenCalled();
    await userEvent.pointer({ target: host, coords, keys: "[MouseLeft]" });
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    // Selecting log text must prevent command activation, even over the same span.
    const text = Array.from(host.querySelectorAll(".term-row")).find((row) =>
      row.textContent?.startsWith("Run help"),
    )!;
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    host.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, ...coords }),
    );
    host.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1, ...coords }),
    );
    await expect(commands).toHaveBeenCalledTimes(1);
    window.getSelection()?.removeAllRanges();
    await userEvent.keyboard("{Control>}");
    await userEvent.pointer({ target: host, coords, keys: "[MouseLeft]" });
    await userEvent.keyboard("{/Control}");
    await expect(commands).toHaveBeenCalledTimes(1);
  },
};

export const ReadOnlyTerminal: Story = {
  args: { readOnly: true },
  play: async ({ canvas, userEvent }) => {
    const run = await canvas.findByRole("button", { name: /Run help/ });
    run.focus();
    await expect(run).toHaveAttribute("aria-disabled", "true");
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Command input is unavailable");
    await userEvent.keyboard("{Enter}");
    await expect(commands).not.toHaveBeenCalled();
  },
};

export const HistoryWrapAndResize: Story = {
  args: { history: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const host = canvasElement.querySelector<HTMLElement>(
      "[data-terminal-viewport]",
    )!;
    await waitFor(() =>
      expect(host.scrollHeight).toBeGreaterThan(host.clientHeight),
    );
    const reveal = () => {
      const height = parseFloat(
        getComputedStyle(host).getPropertyValue("--term-row-height"),
      );
      host.scrollTop = 60 * height;
      host.dispatchEvent(new Event("scroll"));
    };
    reveal();
    const wrapped = await canvas.findAllByRole("button", {
      name: /Run command: wrapped/,
    });
    await expect(wrapped.length).toBeGreaterThan(1);
    wrapped[1].focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(1));
    await expect(commands.mock.calls[0][0].command).toBe("wrapped");
    await userEvent.click(
      canvas.getByRole("button", { name: "Resize terminal" }),
    );
    await waitFor(() => expect(host.clientWidth).toBeLessThan(400));
    reveal();
    await waitFor(() =>
      expect(
        canvas.getAllByRole("button", { name: /Run command: wrapped/ }).length,
      ).toBeGreaterThan(wrapped.length),
    );
    const next = canvas.getAllByRole("button", {
      name: /Run command: wrapped/,
    })[1];
    const rect = next.getBoundingClientRect();
    await userEvent.pointer({
      target: host,
      coords: {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      },
      keys: "[MouseLeft]",
    });
    await waitFor(() => expect(commands).toHaveBeenCalledTimes(2));
    await expect(commands.mock.calls[1][0].command).toBe("wrapped");
    host.scrollTop = host.scrollHeight;
    host.dispatchEvent(new Event("scroll"));
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: /Run command: wrapped/ }),
      ).not.toBeInTheDocument(),
    );
  },
};
