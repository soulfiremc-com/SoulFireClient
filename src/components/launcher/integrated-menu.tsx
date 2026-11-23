import {
  ArrowLeftIcon,
  BoxIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IntegratedServerProcessOutput } from "@/components/IntegratedServerDiagnostics";
import { IntegratedConfigureMenu } from "@/components/launcher/integrated-configure-menu.tsx";
import type { LoginType } from "@/components/launcher/launcher-types.ts";
import {
  StartupFailureNotice,
  StartupProgress,
} from "@/components/launcher/startup-status.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import { useIntegratedDiagnostics } from "@/hooks/use-integrated-diagnostics.ts";
import type { DesktopIntegratedServerCredentials } from "@/lib/desktop-api.ts";
import { desktop } from "@/lib/desktop.ts";
import type { IntegratedStartup } from "@/lib/integrated-startup.ts";
import {
  diagnoseLauncherFailure,
  getLauncherStartupStage,
} from "@/lib/launcher-startup.ts";

type IntegratedState = "configure" | "loading" | "error";

export function IntegratedMenu({
  autoStart,
  onAutoStart,
  onReady,
  setLoginType,
  startup,
}: {
  autoStart: boolean;
  onAutoStart: () => void;
  onReady: (credentials: DesktopIntegratedServerCredentials) => Promise<void>;
  setLoginType: (type: LoginType) => void;
  startup: IntegratedStartup;
}) {
  const hasAutoStarted = useRef(false);
  const [integratedState, setIntegratedState] = useState<IntegratedState>(
    autoStart ? "loading" : "configure",
  );
  // Counts failures in a row, so a retry that fails again still gives feedback.
  const [failedAttempts, setFailedAttempts] = useState(0);
  // Only sets state from the startup callbacks, so the auto-start effect can
  // call it.
  const launch = useCallback(() => {
    startup.start({
      onReady,
      onError: () => {
        setFailedAttempts((count) => count + 1);
        setIntegratedState("error");
      },
    });
  }, [onReady, startup]);
  useEffect(() => {
    if (!autoStart || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    onAutoStart();
    launch();
  }, [autoStart, onAutoStart, launch]);

  switch (integratedState) {
    case "configure": {
      return (
        <IntegratedConfigureMenu
          onBack={() => {
            setLoginType(null);
          }}
          onStart={() => {
            setFailedAttempts(0);
            setIntegratedState("loading");
            launch();
          }}
        />
      );
    }
    case "loading": {
      return (
        <IntegratedLoadingMenu
          cancelStartup={async () => {
            await startup.cancel();
            setIntegratedState("configure");
          }}
        />
      );
    }
    case "error": {
      return (
        <IntegratedErrorMenu
          failedAttempts={failedAttempts}
          setLoginType={setLoginType}
          onConfigure={() => {
            setIntegratedState("configure");
          }}
          onRetry={() => {
            setIntegratedState("loading");
            launch();
          }}
        />
      );
    }
    default: {
      return integratedState satisfies never;
    }
  }
}

function ProcessDetails({ defaultOpen }: { defaultOpen?: boolean }) {
  const { t } = useTranslation("login");
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group/details w-fit"
          />
        }
      >
        <BoxIcon data-icon="inline-start" />
        {t("integrated.details")}
        <ChevronRightIcon
          data-icon="inline-end"
          className="group-data-panel-open/details:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <IntegratedServerProcessOutput />
      </CollapsibleContent>
    </Collapsible>
  );
}

function IntegratedLoadingMenu({
  cancelStartup,
}: {
  cancelStartup: () => Promise<void>;
}) {
  const { t } = useTranslation("login");
  const [cancelling, startTransition] = useTransition();
  const { data } = useIntegratedDiagnostics();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {t(cancelling ? "integrated.cancelling" : "integrated.toast.loading")}
        </CardTitle>
        <CardDescription>
          {t("integrated.progress.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div aria-live="polite">
          <StartupProgress stage={getLauncherStartupStage(data)} />
        </div>
        <ProcessDetails />
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          disabled={cancelling}
          onClick={() => {
            startTransition(async () => {
              try {
                await cancelStartup();
              } catch (error) {
                toast.error(t("integrated.cancelError"), {
                  description: String(error),
                });
              }
            });
          }}
        >
          <XIcon data-icon="inline-start" />
          {t(cancelling ? "integrated.cancelling" : "integrated.cancel")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function IntegratedErrorMenu({
  failedAttempts,
  setLoginType,
  onConfigure,
  onRetry,
}: {
  failedAttempts: number;
  setLoginType: (type: LoginType) => void;
  onConfigure: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("login");
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const { data } = useIntegratedDiagnostics();
  const failure = diagnoseLauncherFailure(data);
  const resetData = () => {
    setResetting(true);
    toast.promise(desktop.integratedServer.resetData(), {
      loading: t("integrated.reset.loading"),
      success: () => {
        setResetting(false);
        return t("integrated.reset.success");
      },
      error: (e) => {
        setResetting(false);
        console.error(e);
        return t("integrated.reset.error");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("integrated.toast.error")}</CardTitle>
        {failedAttempts > 1 && (
          <CardDescription>
            {t("integrated.failedAttempts", { count: failedAttempts })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StartupFailureNotice key={failedAttempts} failure={failure} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={resetting} onClick={onRetry}>
            <PlayIcon data-icon="inline-start" />
            {t("integrated.retry")}
          </Button>
          <Button variant="outline" disabled={resetting} onClick={onConfigure}>
            <SlidersHorizontalIcon data-icon="inline-start" />
            {t("integrated.changeSettings")}
          </Button>
          <Button
            variant="outline"
            disabled={resetting}
            onClick={() => {
              setLoginType("DEDICATED");
            }}
          >
            <ServerIcon data-icon="inline-start" />
            {t("integrated.useExisting")}
          </Button>
        </div>
        <ProcessDetails defaultOpen />
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <Button
          variant="ghost"
          disabled={resetting}
          onClick={() => {
            setLoginType(null);
          }}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {t("integrated.form.back")}
        </Button>
        <AlertDialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
          <AlertDialogTrigger
            render={<Button variant="ghost" disabled={resetting} />}
          >
            {resetting ? (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <RotateCcwIcon data-icon="inline-start" />
            )}
            {t("integrated.reset.button")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("integrated.reset.confirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("integrated.reset.confirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("integrated.reset.keep")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setConfirmResetOpen(false);
                  resetData();
                }}
              >
                {t("integrated.reset.button")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
