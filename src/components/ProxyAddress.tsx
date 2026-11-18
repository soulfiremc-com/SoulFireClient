import { NetworkIcon, PlugIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { stripAddressPrefix } from "@/lib/proxy-address.ts";

export function ProxyAddress({ address }: { address: string }) {
  const { t } = useTranslation("instance");
  const transport = address.startsWith("inet://")
    ? "network"
    : address.startsWith("unix://")
      ? "unix"
      : null;

  if (!transport) {
    return <span className="break-all select-text">{address}</span>;
  }

  const Icon = transport === "network" ? NetworkIcon : PlugIcon;
  const label = t(`proxy.transport.${transport}`);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the flag takes focus so keyboard users can open its tooltip
              tabIndex={0}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the icons and text form one labelled image
              role="img"
              aria-label={label}
              className="inline-flex shrink-0 text-muted-foreground"
            />
          }
        >
          <Icon className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <span className="break-all select-text">
        {stripAddressPrefix(address)}
      </span>
    </span>
  );
}
