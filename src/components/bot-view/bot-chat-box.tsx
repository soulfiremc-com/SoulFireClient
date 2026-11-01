import { createClient } from "@connectrpc/connect";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircleIcon, SendIcon } from "lucide-react";
import { use, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
  disabledReason?: string;
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
      const client = createClient(ChatService, transport);
      const scope = { instanceId: props.instanceId, botId: props.botId };
      const response = await (text.startsWith("/")
        ? client.sendCommand({ scope, command: text.slice(1) })
        : client.sendPublicChat({ scope, message: text }));
      if (response.result?.status !== BotActionStatus.COMPLETED)
        throw new Error(
          response.result?.error || t("bots.chatPanel.sendError"),
        );
    },
    onSuccess: (_response, sentMessage) =>
      setMessage((draft) => (draft.trim() === sentMessage ? "" : draft)),
    onError: (error) =>
      toast.error(t("bots.chatPanel.sendError"), {
        description: error.message,
      }),
  });
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
            onChange={(event) => setMessage(event.currentTarget.value)}
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
        <FieldDescription>
          {props.disabledReason ??
            (transport === null
              ? t("bots.chatPanel.demo")
              : t("bots.chatPanel.help"))}
        </FieldDescription>
        {send.isError && <FieldError>{send.error.message}</FieldError>}
      </Field>
    </form>
  );
}
