import { ClipboardIcon, InfoIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";

export function TextInfoButton(props: { value: ReactNode }) {
  return (
    <GenericInfoButton
      value={() => <p className="whitespace-pre-line">{props.value}</p>}
    />
  );
}

export function CopyInfoButton(props: { value: string }) {
  const copyToClipboard = useCopyToClipboard();
  const { t } = useTranslation("common");

  return (
    <GenericInfoButton
      value={(close) => (
        <div className="flex flex-row items-center gap-2">
          <p className="whitespace-pre-line">{props.value}</p>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t("copyToClipboard")}
            className="shrink-0"
            onClick={() => {
              void copyToClipboard(props.value);
              close();
            }}
          >
            <ClipboardIcon />
          </Button>
        </div>
      )}
    />
  );
}

function GenericInfoButton(props: {
  value: (closer: () => void) => ReactNode;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("infoButton.showInfo")}
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="relative h-4 w-4 shrink-0 opacity-50 after:absolute after:-inset-1"
          />
        }
      >
        <InfoIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent>{props.value(() => setOpen(false))}</PopoverContent>
    </Popover>
  );
}
