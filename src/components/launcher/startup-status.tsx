import {
  CheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import type {
  LauncherFailureKind,
  LauncherStartupStage,
} from "@/lib/launcher-startup.ts";
import { cn } from "@/lib/utils.tsx";

const STARTUP_STAGES = ["prepare", "start", "connect"] as const;

export function StartupProgress({ stage }: { stage: LauncherStartupStage }) {
  const { t } = useTranslation("login");
  const activeIndex = STARTUP_STAGES.indexOf(stage);
  return (
    <ol
      className="flex flex-col gap-3"
      aria-label={t("integrated.progress.label")}
    >
      {STARTUP_STAGES.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-start gap-3",
              !done && !active && "text-muted-foreground",
            )}
          >
            {done ? (
              <CheckIcon
                aria-hidden="true"
                className="text-success-emphasis mt-0.5 size-4 shrink-0"
              />
            ) : active ? (
              <LoaderCircleIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 motion-safe:animate-spin"
              />
            ) : (
              <CircleDashedIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            )}
            <div className="flex flex-col">
              <span className={cn("text-sm", active && "font-medium")}>
                {t(`integrated.progress.${step}.title`)}
              </span>
              {active && (
                <span className="text-muted-foreground text-sm">
                  {t(`integrated.progress.${step}.description`)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function StartupFailureNotice({
  failure,
}: {
  failure: LauncherFailureKind;
}) {
  const { t } = useTranslation("login");
  return (
    <Alert role="alert">
      <TriangleAlertIcon className="text-destructive" />
      <AlertTitle>{t(`integrated.failure.${failure}.title`)}</AlertTitle>
      <AlertDescription>
        {t(`integrated.failure.${failure}.description`)}
      </AlertDescription>
    </Alert>
  );
}
