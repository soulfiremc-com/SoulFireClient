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
    return <span className="select-text break-all">{address}</span>;
  }

  const Icon = transport === "network" ? NetworkIcon : PlugIcon;
  const label = t(`proxy.transport.${transport}`);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              tabIndex={0}
              role="img"
              aria-label={label}
              className="text-muted-foreground inline-flex shrink-0"
            />
          }
        >
          <Icon className="size-4" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <span className="select-text break-all">
        {stripAddressPrefix(address)}
      </span>
    </span>
  );
}
