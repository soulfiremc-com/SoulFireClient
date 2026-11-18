import type { LinkProps } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDotDashedIcon,
  CircleSlashIcon,
  LoaderCircleIcon,
  type LucideIcon,
  RotateCwIcon,
} from "lucide-react";
import type { BotDisplayState, BotFailureKind } from "@/lib/bot-fleet.ts";

export const BOT_STATE_META: Record<
  BotDisplayState,
  { icon: LucideIcon; text: string; bar: string; spin?: boolean }
> = {
  connected: {
    icon: CircleCheckIcon,
    text: "text-success-emphasis",
    bar: "bg-success",
  },
  starting: {
    icon: LoaderCircleIcon,
    text: "text-warning-emphasis",
    bar: "bg-warning-muted",
    spin: true,
  },
  retrying: {
    icon: RotateCwIcon,
    text: "text-warning-emphasis",
    bar: "bg-warning-strong",
  },
  failed: {
    icon: CircleAlertIcon,
    text: "text-destructive",
    bar: "bg-destructive",
  },
  stopping: {
    icon: CircleDotDashedIcon,
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/60",
  },
  stopped: {
    icon: CircleSlashIcon,
    text: "text-muted-foreground",
    bar: "bg-muted",
  },
};

export function getFailureFix(
  kind: BotFailureKind,
  instanceId: string,
): { labelKey: string; link: LinkProps } | null {
  const params = { instance: instanceId };
  switch (kind) {
    case "unreachable":
    case "version":
      return {
        labelKey: "fleet.fix.checkServer",
        link: {
          to: "/instance/$instance/settings/$pageId",
          params: { ...params, pageId: "bot" },
        },
      };
    case "throttled":
      return {
        labelKey: "fleet.fix.slowDown",
        link: {
          to: "/instance/$instance/settings/$pageId",
          params: { ...params, pageId: "bot" },
        },
      };
    case "onlineAuth":
    case "account":
    case "blocked":
      return {
        labelKey: "fleet.fix.accounts",
        link: { to: "/instance/$instance/accounts", params },
      };
    case "proxy":
      return {
        labelKey: "fleet.fix.proxies",
        link: { to: "/instance/$instance/proxies", params },
      };
    case "other":
      return null;
    default:
      return kind satisfies never;
  }
}
