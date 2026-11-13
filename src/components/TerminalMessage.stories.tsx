import { WTerm } from "@wterm/dom";
import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import {
  CommandScopeSchema,
  CommandService,
} from "@/generated/soulfire/command_pb";
import { TransportContext } from "@/components/providers/transport-context";
import CommandInput from "@/components/command-input";
import { TerminalView } from "@/components/terminal";
import { toTerminalLine } from "@/stores/terminal-log-store";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import {
  encodeTerminalInteraction as marker,
  type TerminalLogContent,
} from "@/lib/terminal-interactions";
import { TerminalMessage } from "./terminal-message";

const copy = fn(async (_value: string) => {});
const open = fn();
const command = fn();
const secret = "terminal-fixture-token-not-a-secret";
const encoded = (
  text: string,
  action: "run_command" | "suggest_command" | "copy_to_clipboard" | "open_url",
  value: string,
) =>
  marker({ hover: `About ${text}`, click: { action, value } }) +
  text +
  marker(null);
const entry = {
  personal: true,
  terminalInteractions: true,
  message:
    "Ready: " +
    encoded("Help", "run_command", "help") +
    " / " +
    encoded("Suggest", "suggest_command", "status") +
    " / " +
    encoded("Copy token", "copy_to_clipboard", secret) +
    " / " +
    encoded("Website", "open_url", "https://soulfiremc.com") +
    " " +
    marker({ hover: "Plain hover text <b>" }) +
    "Details" +
    marker(null) +
    " done.",
};

function Example({
  readOnly = false,
  value = entry,
}: {
  readOnly?: boolean;
  value?: TerminalLogContent;
}) {
  const [current, setCurrent] = useState(value);
  return (
    <>
      <div
        data-log-message
        className="w-80 font-mono text-xs whitespace-pre-wrap break-all select-text"
      >
        <TerminalMessage
          entry={current}
          onCommand={readOnly ? undefined : command}
        />
      </div>
      <button onClick={() => setCurrent({ message: "Replaced" })}>
        Replace message
      </button>
      <Toaster />
    </>
  );
}
const meta = {
  title: "Terminal/Plain message",
  component: Example,
  beforeEach: () => {
    copy.mockClear();
    open.mockClear();
    command.mockClear();
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

export const TrustedActions: Story = {
  play: async ({ canvas, userEvent }) => {
    const help = canvas.getByRole("button", {
      name: "Help. Run command: help",
    });
    help.focus();
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("About Help");
    await expect(command).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(command).toHaveBeenCalledWith("run_command", "help");
    await expect(help).toHaveFocus();
    await userEvent.click(
      canvas.getByRole("button", { name: "Suggest. Insert command: status" }),
    );
    await expect(command).toHaveBeenCalledWith("suggest_command", "status");
    const copyButton = canvas.getByRole("button", {
      name: "Copy token. Copy to clipboard",
    });
    await userEvent.hover(copyButton);
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).not.toHaveTextContent(secret);
    await expect(document.body).not.toHaveTextContent(secret);
    await expect(copy).not.toHaveBeenCalled();
    copyButton.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(copy).toHaveBeenCalledWith(secret));
    await waitFor(() =>
      expect(
        within(document.body).getByText("Copied to clipboard", { exact: true }),
      ).toBeVisible(),
    );
    await expect(document.body).not.toHaveTextContent(secret);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Website. Open: https://soulfiremc.com",
      }),
    );
    await expect(open).toHaveBeenCalledWith(
      "https://soulfiremc.com",
      "_blank",
      "noopener,noreferrer",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace message" }),
    );
    await expect(
      canvas.queryByRole("button", { name: /Run command/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Replaced")).toBeVisible();
  },
};
export const ReadOnlyActions: Story = {
  args: { readOnly: true },
  play: async ({ canvas, userEvent }) => {
    const help = canvas.getByRole("button", { name: /Help\. Run command/ });
    await expect(help).toHaveAttribute("aria-disabled", "true");
    help.focus();
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Command input is unavailable");
    await userEvent.keyboard("{Enter}");
    await expect(command).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: /Copy token/ }));
    await expect(copy).toHaveBeenCalledWith(secret);
  },
};
export const UntrustedText: Story = {
  args: {
    value: {
      ...entry,
      personal: false,
      message:
        entry.message +
        "<img src=x onerror=alert(1)>\x1b]8;;https://example.com\x1b\\literal\x1b]8;;\x1b\\",
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const message = canvasElement.querySelector("[data-log-message]")!;
    await expect(
      within(message as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    await expect(message).toHaveTextContent(
      "Ready: Help / Suggest / Copy token / Website Details done.<img src=x onerror=alert(1)>literal",
    );
    await expect(message.querySelector("img")).toBeNull();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(command).not.toHaveBeenCalled();
  },
};
export const SelectionAndModifiers: Story = {
  play: async ({ canvas, userEvent }) => {
    const help = canvas.getByRole("button", { name: /Help\. Run command/ });
    await userEvent.keyboard("{Control>}");
    await userEvent.click(help);
    await userEvent.keyboard("{/Control}");
    await expect(command).not.toHaveBeenCalled();
    const range = document.createRange();
    range.selectNodeContents(help);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    help.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 1,
        clientY: 1,
      }),
    );
    help.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        detail: 1,
        clientX: 1,
        clientY: 1,
      }),
    );
    await expect(command).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    await userEvent.pointer({
      target: help,
      coords: { clientX: 1, clientY: 1 },
      keys: "[MouseLeft>]",
    });
    await userEvent.pointer({
      target: help,
      coords: { clientX: 50, clientY: 1 },
      keys: "[/MouseLeft]",
    });
    await expect(command).not.toHaveBeenCalled();
    help.focus();
    await userEvent.keyboard("{Enter}");
    await expect(command).toHaveBeenCalledTimes(1);
  },
};
export const WrappedUnicode: Story = {
  args: {
    value: {
      ...entry,
      message:
        "Before " +
        marker({ hover: "Multiline tooltip" }) +
        "A界é ".repeat(80) +
        "\nnext line" +
        marker(null) +
        " after",
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    const text = canvasElement.querySelector<HTMLElement>(
      "[data-log-message] [tabindex]",
    )!;
    text.focus();
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Multiline tooltip");
    await expect(text.innerText).toContain("A界é ".repeat(80) + "\nnext line");
    await expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        within(document.body).queryByRole("tooltip"),
      ).not.toBeInTheDocument(),
    );
  },
};

export const WrappedAction: Story = {
  args: {
    value: {
      ...entry,
      message:
        "Before " +
        marker({
          hover: "Multiline action",
          click: { action: "copy_to_clipboard", value: secret },
        }) +
        "A界é ".repeat(80) +
        "\nnext line" +
        marker(null) +
        " after",
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    const text = canvasElement.querySelector<HTMLElement>(
      "[data-log-message] [data-slot=tooltip-trigger]",
    )!;
    await expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    await expect(text.getBoundingClientRect().height).toBeGreaterThan(30);
    await userEvent.click(text);
    await expect(copy).toHaveBeenCalledWith(secret);
  },
};

export const WasmFailureFallback: Story = {
  beforeEach: () => {
    const original = WTerm.prototype.init;
    WTerm.prototype.init = async () => {
      throw new Error("Fixture WASM unavailable");
    };
    return () => {
      WTerm.prototype.init = original;
    };
  },
  render: () => (
    <TransportContext
      value={createRouterTransport((router) =>
        router.service(CommandService, {
          executeCommand: (request) => {
            command(request);
            return { code: 1 };
          },
          tabCompleteCommand: () => ({ suggestions: [] }),
        }),
      )}
    >
      <TerminalView
        entries={[toTerminalLine({ ...entry, id: "fallback", level: "WARN" })]}
        theme="mocha"
      >
        <CommandInput
          scope={create(CommandScopeSchema, {
            scope: {
              case: "instance",
              value: { instanceId: "fixture-instance" },
            },
          })}
        />
      </TerminalView>
      <Toaster />
    </TransportContext>
  ),
  play: async ({ canvas, userEvent }) => {
    const help = await canvas.findByRole("button", {
      name: "Help. Run command: help",
    });
    await expect(canvas.getByText(/WARN Ready:/)).toBeVisible();
    help.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(command).toHaveBeenCalledTimes(1));
    await expect(command.mock.calls[0][0].command).toBe("help");
    await expect(command.mock.calls[0][0].scope.scope).toEqual({
      case: "instance",
      value: expect.objectContaining({ instanceId: "fixture-instance" }),
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Suggest. Insert command: status" }),
    );
    await expect(canvas.getByRole("combobox")).toHaveValue("status");
    await expect(canvas.getByRole("combobox")).toHaveFocus();
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy token. Copy to clipboard" }),
    );
    await expect(copy).toHaveBeenCalledWith(secret);
    await expect(document.body).not.toHaveTextContent(secret);
  },
};
