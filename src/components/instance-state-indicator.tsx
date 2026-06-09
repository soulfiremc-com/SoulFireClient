import {
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { InstanceState } from "@/generated/soulfire/instance_pb.ts";
import { translateInstanceState } from "@/lib/types.ts";
import { cn } from "@/lib/utils.tsx";

const stateIndicatorStyles: Record<InstanceState, string> = {
  [InstanceState.STARTING]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  [InstanceState.RUNNING]:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  [InstanceState.PAUSED]:
    "border-muted-foreground/30 bg-muted text-muted-foreground",
  [InstanceState.STOPPING]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  [InstanceState.STOPPED]: "border-border bg-background text-muted-foreground",
};

const stateIndicatorIcons: Record<
  InstanceState,
  ComponentType<{ className?: string }>
> = {
  [InstanceState.STARTING]: LoaderCircleIcon,
  [InstanceState.RUNNING]: PlayIcon,
  [InstanceState.PAUSED]: PauseIcon,
  [InstanceState.STOPPING]: LoaderCircleIcon,
  [InstanceState.STOPPED]: SquareIcon,
};

export function InstanceStateIndicator({ state }: { state: InstanceState }) {
  const { i18n } = useTranslation("common");
  const Icon = stateIndicatorIcons[state];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        stateIndicatorStyles[state],
      )}
    >
      <Icon
        className={cn(
          "size-3.5",
          (state === InstanceState.STARTING ||
            state === InstanceState.STOPPING) &&
            "animate-spin",
        )}
      />
      {translateInstanceState(i18n, state)}
    </span>
  );
}
