import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon, SendIcon } from "lucide-react";
import { use, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConnectError } from "@connectrpc/connect";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { ChatService } from "@/generated/soulfire/chat_pb";
import { BotActionStatus } from "@/generated/soulfire/bot_live_pb";

/** Sends one public chat message or command as this bot. */
export function BotChatBox(props: {
  instanceId: string;
  botId: string;
  disabledReason?: string | undefined;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const inputId = useId();
  const [message, setMessage] = useState("");
  const disabled = props.disabledReason !== undefined || transport === null;
  const send = useMutation({
    mutationKey: ["bot", "chat", props.instanceId, props.botId],
    mutationFn: async (text: string) => {
      if (transport === null) return;
      const client = createRpcClient(ChatService, transport);
      const scope = { instanceId: props.instanceId, botId: props.botId };
      const response = await (text.startsWith("/")
        ? Effect.runPromise(
            client.sendCommand({ scope, command: text.slice(1) }),
          )
        : Effect.runPromise(client.sendPublicChat({ scope, message: text })));
      // A missing or unspecified status still means the server accepted the call.
      switch (response.result?.status) {
        case BotActionStatus.FAILED: {
          throw new Error(response.result.error ?? "");
        }
        case BotActionStatus.CANCELLED: {
          throw new Error(t("bots.chatPanel.cancelled"));
        }
        case BotActionStatus.UNSPECIFIED:
        case BotActionStatus.COMPLETED:
        case undefined: {
          break;
        }
      }
    },
    onSuccess: (_response, sentMessage) => {
      setMessage((draft) => (draft.trim() === sentMessage ? "" : draft));
    },
  });
  const errorMessage =
    send.error instanceof ConnectError
      ? send.error.rawMessage
      : send.error?.message;
  const submit = () => {
    const text = message.trim();
    if (text !== "" && !disabled && !send.isPending) send.mutate(text);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field>
        <FieldLabel htmlFor={inputId}>{t("bots.chatPanel.label")}</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={inputId}
            value={message}
            disabled={disabled}
            placeholder={t("bots.chatPanel.placeholder")}
            onChange={(event) => {
              setMessage(event.currentTarget.value);
              if (!send.isPending) send.reset();
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              disabled={disabled || send.isPending || message.trim() === ""}
            >
              {send.isPending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              {t("bots.chatPanel.send")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- FieldDescription renders a p, and the status role announces this update */}
        <FieldDescription role="status">
          {props.disabledReason ??
            (transport === null
              ? t("bots.chatPanel.demo")
              : send.isPending
                ? t("bots.chatPanel.sending")
                : send.isSuccess
                  ? t("bots.chatPanel.sent")
                  : t("bots.chatPanel.help"))}
        </FieldDescription>
        {send.isError && (
          <FieldError>
            {errorMessage
              ? t("bots.chatPanel.sendErrorReason", { reason: errorMessage })
              : t("bots.chatPanel.sendError")}
          </FieldError>
        )}
      </Field>
    </form>
  );
}
