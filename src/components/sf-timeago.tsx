import { format, formatDistanceToNow } from "date-fns";
import { ClipboardIcon } from "lucide-react";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useChangingData } from "@/hooks/use-changing-value.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useDateFnsLocale } from "@/hooks/use-date-fns-locale.ts";

export const SFTimeAgo = React.memo(function SFTimeAgo(props: { date: Date }) {
  const { t } = useTranslation("common");
  const dateFnsLocale = useDateFnsLocale();
  const copyToClipboard = useCopyToClipboard();
  const baseText = useChangingData(() =>
    formatDistanceToNow(props.date, {
      addSuffix: true,
      includeSeconds: true,
      locale: dateFnsLocale,
    }),
  );
  const formatted = useMemo(
    () => format(props.date, "PPpp", { locale: dateFnsLocale }),
    [props.date, dateFnsLocale],
  );
  const isoString = props.date.toISOString();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="link"
            className="h-auto p-0 font-normal text-inherit"
            title={formatted}
          />
        }
      >
        {baseText}
      </PopoverTrigger>
      <PopoverContent className="flex size-fit flex-row items-center gap-1 p-2">
        <time className="text-center text-sm select-text" dateTime={isoString}>
          {formatted}
        </time>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("copyToClipboard")}
          onClick={() => {
            void copyToClipboard(isoString);
          }}
        >
          <ClipboardIcon className="select-none" />
        </Button>
      </PopoverContent>
    </Popover>
  );
});
