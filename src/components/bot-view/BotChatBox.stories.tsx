import { createRouterTransport } from "@connectrpc/connect";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { expect, fn, waitFor } from "storybook/test";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { ChatService } from "@/generated/soulfire/chat_pb";
import { BotActionStatus } from "@/generated/soulfire/bot_live_pb";
import { BotChatBox } from "./bot-chat-box.tsx";

const requests = fn();
let pending = false;
let failed = false;
let finish: (() => void) | undefined;
async function deliver() {
  if (pending)
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  return {
    result: {
      status: failed ? BotActionStatus.FAILED : BotActionStatus.COMPLETED,
      ...(failed ? { error: "Chat is unavailable" } : {}),
    },
  };
}
const transport = createRouterTransport((router) =>
  router.service(ChatService, {
    sendPublicChat: (request) => {
      requests("chat", request);
      return deliver();
    },
    sendCommand: (request) => {
      requests("command", request);
      return deliver();
    },
  }),
);

const meta = {
  title: "Bots/Chat composer",
  component: BotChatBox,
  args: { instanceId: "instance-example", botId: "bot-example" },
  beforeEach: ({ parameters }) => {
    pending = parameters.pendingDelivery ?? false;
    failed = parameters.failedDelivery ?? false;
    requests.mockClear();
    finish = undefined;
    return () => {
      finish?.();
    };
  },
  decorators: [
    (Story) => {
      const [client] = useState(() => new QueryClient());
      return (
        <QueryClientProvider client={client}>
          <TransportContext value={transport}>
            <Story />
          </TransportContext>
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof BotChatBox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const KeepsNewDraftDuringSend: Story = {
  parameters: { pendingDelivery: true },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Send as this bot" });
    const send = canvas.getByRole("button", { name: "Send" });
    await userEvent.type(input, "First message");
    await userEvent.click(send);
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    await expect(send).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "Next draft");
    finish?.();
    await waitFor(() => expect(send).toBeEnabled());
    await expect(input).toHaveValue("Next draft");
    await expect(requests).toHaveBeenCalledWith(
      "chat",
      expect.objectContaining({
        message: "First message",
        scope: expect.objectContaining({
          instanceId: "instance-example",
          botId: "bot-example",
        }),
      }),
    );
  },
};

export const RoutesCommandToThisBot: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Send as this bot" });
    await userEvent.type(input, "/list");
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(input).toHaveValue(""));
    await expect(requests).toHaveBeenCalledWith(
      "command",
      expect.objectContaining({
        command: "list",
        scope: expect.objectContaining({
          instanceId: "instance-example",
          botId: "bot-example",
        }),
      }),
    );
  },
};

export const KeepsDraftWhenActionFails: Story = {
  parameters: { failedDelivery: true },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Send as this bot" });
    const send = canvas.getByRole("button", { name: "Send" });
    await userEvent.type(input, "Keep this message");
    await userEvent.click(send);
    await expect(await canvas.findByText("Chat is unavailable")).toBeVisible();
    await expect(input).toHaveValue("Keep this message");
    await expect(send).toBeEnabled();
    await expect(requests).toHaveBeenCalledTimes(1);
  },
};
