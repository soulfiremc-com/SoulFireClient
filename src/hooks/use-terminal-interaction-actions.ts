import { useTranslation } from "react-i18next";
import type { TerminalCommandHandler } from "@/components/terminal-command-context";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type {
  TerminalClick,
  TerminalInteraction,
} from "@/lib/terminal-interactions";
import { openExternalUrl } from "@/lib/utils";

// Callers provide a command handler only for a mounted, authorized command input.
// A message can carry a command string, but cannot select its RPC scope.
export function useTerminalInteractionActions(
  onCommand?: TerminalCommandHandler,
) {
  const { t } = useTranslation("common");
  const copy = useCopyToClipboard({ sensitive: true });
  const disabled = (click?: TerminalClick) =>
    !click ||
    (!onCommand &&
      (click.action === "run_command" || click.action === "suggest_command"));
  const description = (click?: TerminalClick) =>
    !click
      ? ""
      : click.action === "copy_to_clipboard"
        ? t("terminal.actions.copy_to_clipboard")
        : t(`terminal.actions.${click.action}`, { value: click.value });
  return {
    disabled,
    description,
    tooltip: (metadata: TerminalInteraction) =>
      [
        metadata.hover,
        description(metadata.click),
        metadata.click && disabled(metadata.click)
          ? t("terminal.actions.unavailable")
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    activate: (metadata: TerminalInteraction) => {
      const click = metadata.click;
      if (!click || disabled(click)) return;
      if (click.action === "copy_to_clipboard") copy(click.value);
      else if (click.action === "open_url") openExternalUrl(click.value);
      else onCommand?.(click.action, click.value);
    },
  };
}
