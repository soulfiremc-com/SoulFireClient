import {
  useQueryClient,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  BugIcon,
  ChevronDownIcon,
  LoaderCircleIcon,
  LogOutIcon,
  RotateCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IntegratedServerSupportActions } from "@/components/IntegratedServerDiagnostics";
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
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import posthog, { isPostHogConfigured } from "@/lib/posthog.ts";
import { runAsync } from "@/lib/utils.tsx";
import { getServerType, logOut } from "@/lib/web-rpc.ts";

type ErrorComponentProps = {
  error: Error;
  reset?: () => void;
};

export function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();
  const mountedRef = useRef(true);
  const retryingRef = useRef(false);
  const [revalidating, setRevalidating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  useEffect(() => {
    if (isPostHogConfigured) {
      posthog.captureException(error);
    }
  }, [error]);

  const reloadPage = useCallback(() => {
    runAsync(async () => {
      if (retryingRef.current) return;
      retryingRef.current = true;
      setRevalidating(true);
      queryErrorResetBoundary.reset();
      try {
        // A boundary reset only permits retries; it does not clear cached query
        // errors. Reset inactive failures too, before the route mounts them again.
        await queryClient.resetQueries({
          predicate: (query) => query.state.status === "error",
        });
        await router.invalidate({ sync: true });
      } finally {
        retryingRef.current = false;
        if (mountedRef.current) {
          // Nested CatchBoundary instances are independent of route invalidation.
          // Allow failed queries to retry when their children mount again.
          queryErrorResetBoundary.reset();
          reset?.();
          setRevalidating(false);
        }
      }
    });
  }, [router, queryClient, queryErrorResetBoundary, reset]);

  useEffect(() => {
    const interval = setInterval(reloadPage, 1000 * 5);
    return () => clearInterval(interval);
  }, [reloadPage]);

  const hasStack = error.stack && error.stack !== error.message;

  return (
    <div className="flex size-full grow">
      <Card className="m-auto flex max-w-2xl flex-col">
        <CardHeader>
          <CardTitle className="flex-row flex gap-1 text-2xl font-bold">
            <BugIcon className="h-8" />
            {t("error.page.title")}
          </CardTitle>
          <CardDescription>{t("error.page.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <div className="flex flex-col gap-2">
              <p className="select-text break-words text-destructive">
                {error.message}
              </p>
              {hasStack && (
                <>
                  <CollapsibleTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit gap-1 px-2"
                      />
                    }
                  >
                    <ChevronDownIcon
                      className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                    {t("error.page.showDetails")}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="max-h-64 select-text overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
                      {error.stack}
                    </pre>
                  </CollapsibleContent>
                </>
              )}
            </div>
          </Collapsible>
          {isDesktopApp() && getServerType() === "integrated" && (
            <IntegratedServerSupportActions />
          )}
        </CardContent>
        <CardFooter className="flex flex-row gap-2">
          <Button
            className="w-fit"
            onClick={() =>
              runAsync(async () => {
                if (isDesktopApp()) {
                  await desktop.integratedServer.kill();
                }
                logOut();
                await navigate({
                  to: "/",
                  replace: true,
                });
              })
            }
          >
            <LogOutIcon />
            {t("error.page.logOut")}
          </Button>
          <Button onClick={reloadPage} disabled={revalidating}>
            {revalidating ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <RotateCwIcon />
            )}
            {t("error.page.reloadPage")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
