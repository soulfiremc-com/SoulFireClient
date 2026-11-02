import { create } from "@bufbuild/protobuf";
import { ConnectError, createRouterTransport } from "@connectrpc/connect";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context";
import {
  CommandScopeSchema,
  CommandService,
} from "@/generated/soulfire/command_pb";
import { COMMAND_HISTORY_KEY } from "@/lib/command-history";
import { getCommandTokenRange } from "@/lib/command-token";
import { toTerminalLine } from "@/stores/terminal-log-store";
import CommandInput from "./command-input";
import { TerminalView } from "./terminal";

const commands = fn();
const completions = fn();
let emitLog = () => {};
const scope = create(CommandScopeSchema, {
  scope: { case: "global", value: {} },
});
const rootCompletions = [
  { suggestion: "help", tooltip: "List available commands" },
  { suggestion: "history", tooltip: "Show recent commands" },
  { suggestion: "say", tooltip: "Send a message" },
  { suggestion: "status", tooltip: "Show bot status" },
];

function ShellPromptExample({ theme = "mocha" }: { theme?: string }) {
  const [entries, setEntries] = useState(() => [
    toTerminalLine({
      id: "ready",
      message: "Command interface ready.",
      level: "INFO",
      loggerName: "com.soulfiremc.server.Console",
      personal: false,
    }),
    toTerminalLine({
      id: "connected",
      message: "\x1b[32m3 bots connected\x1b[0m",
      level: "INFO",
      loggerName: "com.soulfiremc.server.BotManager",
      personal: false,
    }),
  ]);
  const [transport] = useState(() => {
    let sequence = 0;
    const append = (message: string, personal = true) =>
      setEntries((current) => [
        ...current,
        toTerminalLine({ id: `fixture-${sequence++}`, message, personal }),
      ]);
    emitLog = () => append("INFO BotManager Connection healthy", false);
    return createRouterTransport((router) =>
      router.service(CommandService, {
        tabCompleteCommand: (request) => {
          completions(request);
          const range = getCommandTokenRange(request.command, request.cursor);
          const prefix = request.command.slice(range.start, request.cursor);
          const candidates = request.command.startsWith("say ")
            ? [
                { suggestion: "Hello", tooltip: "A greeting" },
                { suggestion: "Howdy", tooltip: "An informal greeting" },
              ]
            : rootCompletions;
          return {
            suggestions: candidates.filter((candidate) =>
              candidate.suggestion.startsWith(prefix),
            ),
          };
        },
        executeCommand: (request) => {
          commands(request);
          if (request.command === "fail")
            throw new ConnectError("Command rejected");
          append(`> ${request.command}`);
          append(
            request.command === "status"
              ? "\x1b[32m3 bots online, 0 disconnected\x1b[0m"
              : request.command.startsWith("say ")
                ? "Message sent to 3 bots."
                : "Available commands: help, history, say, status",
          );
          return { code: 1 };
        },
      }),
    );
  });
  useEffect(() => {
    const timer = setInterval(() => emitLog(), 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="bg-background min-h-screen p-6">
      <TransportContext value={transport}>
        <TerminalView entries={entries} theme={theme}>
          <CommandInput scope={scope} />
        </TerminalView>
        <Toaster />
      </TransportContext>
    </div>
  );
}

const meta = {
  title: "Terminal/Shell prompt",
  component: ShellPromptExample,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    const history = localStorage.getItem(COMMAND_HISTORY_KEY);
    localStorage.removeItem(COMMAND_HISTORY_KEY);
    commands.mockClear();
    completions.mockClear();
    return () => {
      toast.dismiss();
      if (history === null) localStorage.removeItem(COMMAND_HISTORY_KEY);
      else localStorage.setItem(COMMAND_HISTORY_KEY, history);
    };
  },
} satisfies Meta<typeof ShellPromptExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};

export const CompletionAndHistory: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", {
      name: "Command",
    }) as HTMLInputElement;
    await userEvent.type(input, "h");
    await canvas.findByRole("option", { name: "help List available commands" });
    await userEvent.keyboard("{Tab}");
    await expect(input).toHaveValue("help");
    await userEvent.keyboard("{Tab}");
    await expect(input).toHaveValue("history");
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    await expect(input).toHaveValue("help");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(commands).toHaveBeenCalledWith(
        expect.objectContaining({ command: "help", scope }),
      ),
    );
    await userEvent.type(input, "unfinished draft");
    await userEvent.keyboard("{Escape}{ArrowUp}");
    await expect(input).toHaveValue("help");
    await userEvent.keyboard("{ArrowDown}");
    await expect(input).toHaveValue("unfinished draft");
    await userEvent.keyboard("{Control>}c{/Control}");
    await expect(input).toHaveValue("");
    await expect(commands).toHaveBeenCalledTimes(1);
  },
};

export const DraftSurvivesLogs: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", {
      name: "Command",
    }) as HTMLInputElement;
    await userEvent.type(input, "say H friend");
    input.setSelectionRange(5, 5);
    input.dispatchEvent(new Event("click", { bubbles: true }));
    await canvas.findByRole("option", { name: "Hello A greeting" });
    const popup = canvas.getByRole("listbox").parentElement!;
    await expect(popup.dataset.side).toBe("top");
    emitLog();
    await waitFor(() =>
      expect(
        canvasElement.querySelector("[data-terminal-viewport]"),
      ).toHaveTextContent("Connection healthy"),
    );
    await expect(input).toHaveFocus();
    await expect(input).toHaveValue("say H friend");
    await expect(input.selectionStart).toBe(5);
    await userEvent.keyboard("{Tab}");
    await expect(input).toHaveValue("say Hello friend");
    await expect(input.selectionStart).toBe(9);
    input.setSelectionRange(4, 9);
    await userEvent.keyboard("{Control>}c{/Control}");
    await expect(input).toHaveValue("say Hello friend");
    input.setSelectionRange(input.value.length, input.value.length);
    await userEvent.click(
      canvasElement.querySelector("[data-terminal-viewport]")!,
    );
    await expect(input).toHaveFocus();
  },
};

export const CompositionAndFailure: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", {
      name: "Command",
    }) as HTMLInputElement;
    await userEvent.type(input, "say hello");
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    await userEvent.keyboard("{Enter}");
    expect(commands).not.toHaveBeenCalled();
    expect(input).toHaveValue("say hello");
    input.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );
    await userEvent.clear(input);
    await userEvent.type(input, "fail");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveValue("fail"));
    await within(document.body).findByText(/Command rejected/);
  },
};

export const LightTheme: Story = { args: { theme: "latte" } };
