import { useQuery } from "@tanstack/react-query";
import {
  ActivityIcon,
  ClipboardIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useStickToBottom } from "use-stick-to-bottom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Scroller } from "@/components/ui/scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { desktop, isDesktopApp } from "@/lib/desktop";
import type {
  DesktopIntegratedServerDiagnostics,
  DesktopIntegratedServerLog,
} from "@/lib/desktop-api";

function useIntegratedDiagnostics() {
  return useQuery({
    queryKey: ["integrated-server-diagnostics"],
    queryFn: () => desktop.integratedServer.getDiagnostics(),
    refetchInterval: 1_000,
    staleTime: 0,
    retry: false,
    enabled: isDesktopApp(),
  });
}

export function OpenIntegratedDataDirectoryButton() {
  const { t } = useTranslation("common");
  const [pending, startTransition] = useTransition();
  if (!isDesktopApp()) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await desktop.integratedServer.openDataDirectory();
          } catch (error) {
            toast.error(t("integratedDiagnostics.openDirectoryError"), {
              description: String(error),
            });
          }
        })
      }
    >
      <FolderOpenIcon data-icon="inline-start" />
      {t("integratedDiagnostics.openDirectory")}
    </Button>
  );
}

export function IntegratedServerSupportActions() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  if (!isDesktopApp()) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <OpenIntegratedDataDirectoryButton />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ActivityIcon data-icon="inline-start" />
        {t("integratedDiagnostics.title")}
      </Button>
      <IntegratedServerDiagnosticsDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function IntegratedServerDiagnosticsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("integratedDiagnostics.title")}</DialogTitle>
          <DialogDescription>
            {t("integratedDiagnostics.description")}
          </DialogDescription>
        </DialogHeader>
        {!!open && <DiagnosticsDetails />}
      </DialogContent>
    </Dialog>
  );
}

function ProcessSummary({
  data,
}: {
  data: DesktopIntegratedServerDiagnostics | undefined;
}) {
  const { t } = useTranslation("common");
  const [now, setNow] = useState(Date.now);
  const active =
    data?.status === "preparing" ||
    data?.status === "starting" ||
    data?.status === "running" ||
    data?.status === "stopping";
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [active]);
  if (!data) return <Skeleton className="h-5 w-48" />;
  const lastOutputAt =
    data.logs[data.logs.length - 1]?.timestamp ?? data.startedAt;
  const elapsed = data.startedAt
    ? Math.max(0, Math.floor(((data.exitedAt ?? now) - data.startedAt) / 1000))
    : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t(`integratedDiagnostics.status.${data.status}`)}</span>
        {data.pid !== null && (
          <span className="select-text font-mono">PID {data.pid}</span>
        )}
        {elapsed !== null && (
          <span className="tabular-nums">
            {t("integratedDiagnostics.elapsed", { count: elapsed })}
          </span>
        )}
      </div>
      {(data.status === "preparing" || data.status === "starting") &&
        lastOutputAt !== null &&
        now - lastOutputAt >= 30_000 && (
          <Alert>
            <AlertDescription>
              {t("integratedDiagnostics.quiet", {
                count: Math.floor((now - lastOutputAt) / 1000),
              })}
            </AlertDescription>
          </Alert>
        )}
      {!!data.error && (
        <Alert variant="destructive">
          <AlertDescription className="select-text break-words">
            {data.error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ProcessOutput({
  logs,
  filter = "",
}: {
  logs: DesktopIntegratedServerLog[];
  filter?: string;
}) {
  const { t } = useTranslation("common");
  const { scrollRef, contentRef } = useStickToBottom({
    initial: "instant",
    resize: "instant",
  });
  const filtered = filter
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(filter.toLowerCase()),
      )
    : logs;
  return (
    <Scroller ref={scrollRef} className="h-56" offset={1}>
      <div
        ref={contentRef}
        className="flex min-w-0 flex-col gap-1 rounded-md bg-muted p-3 font-mono text-xs"
      >
        {filtered.length === 0 ? (
          <p className="text-muted-foreground">
            {t(
              filter
                ? "integratedDiagnostics.noMatches"
                : "integratedDiagnostics.noOutput",
            )}
          </p>
        ) : (
          filtered.map((log) => (
            <p
              key={log.id}
              className="select-text whitespace-pre-wrap break-all"
            >
              <span className="text-muted-foreground">[{log.source}] </span>
              {log.message}
            </p>
          ))
        )}
      </div>
    </Scroller>
  );
}

export function IntegratedServerProcessOutput() {
  const query = useIntegratedDiagnostics();
  return (
    <div className="flex flex-col gap-3">
      <ProcessSummary data={query.data} />
      {!!query.error && (
        <Alert variant="destructive">
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      )}
      <ProcessOutput logs={query.data?.logs ?? []} />
      <IntegratedServerSupportActions />
    </div>
  );
}

function createReport(data: DesktopIntegratedServerDiagnostics): string {
  const { logs, ...details } = data;
  return [
    "SoulFire integrated server diagnostics",
    `Client: ${APP_VERSION}`,
    `Captured: ${new Date().toISOString()}`,
    JSON.stringify(details, null, 2),
    "",
    "Recent output (review for personal information before sharing):",
    ...logs.map(
      (log) =>
        `${new Date(log.timestamp).toISOString()} [${log.source}] ${log.message}`,
    ),
  ].join("\n");
}

function DiagnosticsDetails() {
  const { t } = useTranslation("common");
  const query = useIntegratedDiagnostics();
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dump, setDump] = useState<{
    path: string;
    startedAt: number | null;
  } | null>(null);
  const data = query.data;

  const dumpPath = dump?.startedAt === data?.startedAt ? dump?.path : null;

  async function runAction(name: string, operation: () => Promise<unknown>) {
    setAction(name);
    setActionError(null);
    try {
      await operation();
      await query.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(null);
    }
  }

  const processRunning = !!data?.pid && data.exitedAt === null;
  const fields = data
    ? [
        { label: t("integratedDiagnostics.java"), value: data.javaPath },
        { label: t("integratedDiagnostics.jar"), value: data.jarPath },
        { label: t("integratedDiagnostics.data"), value: data.dataDirectory },
        { label: t("integratedDiagnostics.port"), value: data.port },
        {
          label: t("integratedDiagnostics.exit"),
          value: data.exitSignal ?? data.exitCode,
        },
        { label: "jcmd", value: data.jcmdPath },
      ]
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ProcessSummary data={data} />
      {!!query.error && (
        <Alert variant="destructive">
          <AlertDescription>{query.error.message}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="text-muted-foreground">{field.label}</dt>
            <dd className="select-text break-all font-mono">
              {field.value ?? t("integratedDiagnostics.unavailable")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <OpenIntegratedDataDirectoryButton />
        <Button
          variant="outline"
          size="sm"
          disabled={!data || action !== null}
          onClick={() =>
            void runAction("copy", async () => {
              await desktop.clipboard.writeText(
                createReport(await desktop.integratedServer.getDiagnostics()),
              );
              toast.success(t("integratedDiagnostics.copied"));
            })
          }
        >
          <ClipboardIcon data-icon="inline-start" />
          {t("integratedDiagnostics.copy")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || action !== null}
          onClick={() =>
            void runAction("save", async () => {
              const selected = await desktop.dialog.save({
                defaultPath: "soulfire-diagnostics.txt",
                filters: [{ name: "Text", extensions: ["txt"] }],
              });
              if (!selected) return;
              await desktop.fs.writeTextFile(
                selected,
                createReport(await desktop.integratedServer.getDiagnostics()),
              );
              toast.success(t("integratedDiagnostics.saved"));
            })
          }
        >
          <DownloadIcon data-icon="inline-start" />
          {t("integratedDiagnostics.save")}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!processRunning || !data?.jcmdPath || action !== null}
            onClick={() =>
              void runAction("dump", async () => {
                setDump({
                  path: await desktop.integratedServer.captureThreadDump(),
                  startedAt: data?.startedAt ?? null,
                });
              })
            }
          >
            {action === "dump" ? (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <FileTextIcon data-icon="inline-start" />
            )}
            {t("integratedDiagnostics.capture")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={action !== null}
            onClick={() =>
              void runAction("jcmd", () =>
                desktop.integratedServer.selectJcmd(),
              )
            }
          >
            {t("integratedDiagnostics.chooseJcmd")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            data?.jcmdPath
              ? "integratedDiagnostics.dumpHelp"
              : "integratedDiagnostics.jcmdHelp",
          )}
        </p>
        {!!dumpPath && (
          <div className="flex flex-col items-start gap-2">
            <p className="select-text break-all font-mono text-xs">
              {dumpPath}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("openDump", async () => {
                  const error = await desktop.shell.openPath(dumpPath);
                  if (error) throw new Error(error);
                })
              }
            >
              {t("integratedDiagnostics.openDump")}
            </Button>
          </div>
        )}
      </div>
      {!!actionError && (
        <Alert variant="destructive">
          <AlertDescription className="select-text break-words">
            {actionError}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("integratedDiagnostics.filter")}
            placeholder={t("integratedDiagnostics.filter")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </InputGroup>
        <ProcessOutput logs={data?.logs ?? []} filter={filter} />
        {!!data?.droppedLogCount && (
          <p className="text-xs text-muted-foreground">
            {t("integratedDiagnostics.truncated", {
              count: data.droppedLogCount,
            })}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("integratedDiagnostics.privacy")}
      </p>
    </div>
  );
}
