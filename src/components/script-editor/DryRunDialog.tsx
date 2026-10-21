import { createClient } from "@connectrpc/connect";
import { useSelector } from "@tanstack/react-store";
import { FlaskConical, LoaderCircle } from "lucide-react";
import {
  use,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { TransportContext } from "@/components/providers/transport-context";
import { getNodeDefinition } from "@/components/script-editor/nodes/types";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { valueToJson } from "@/lib/protobuf";
import { InvalidMockInput, parseMockInputs } from "@/lib/script-dry-run";
import { ExecutionLogs } from "./ExecutionLogs";
import type { LogEntry, LogLevel } from "./types";

type RunResult = {
  status: "idle" | "completed" | "failed" | "cancelled";
  error: string | null;
};

export function DryRunDialog({ instanceId }: { instanceId: string }) {
  const editor = useScriptEditor();
  const transport = use(TransportContext);
  const { t } = useTranslation("instance");
  const id = useId();
  const nodes = useSelector(editor.document, (s) => s.nodes);
  const isDirty = useSelector(editor.document, (s) => s.isDirty);
  const scriptId = useSelector(editor.document, (s) => s.scriptId);
  const [open, setOpen] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState("");
  const [mockInputs, setMockInputs] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const triggerNodes = useMemo(
    () => nodes.filter((node) => getNodeDefinition(node.type ?? "")?.isTrigger),
    [nodes],
  );
  const selectedNode = triggerNodes.find((node) => node.id === selectedTrigger);
  const triggerItems = useMemo(
    () =>
      triggerNodes.map((node) => ({
        value: node.id,
        label: String(
          node.data.label ??
            getNodeDefinition(node.type ?? "")?.label ??
            node.id,
        ),
      })),
    [triggerNodes],
  );
  const triggerOutputs =
    getNodeDefinition(selectedNode?.type ?? "")?.outputs.filter(
      (port) => port.type !== "execution",
    ) ?? [];
  const needsSave = !scriptId || isDirty;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const [result, run, isPending] = useActionState<RunResult, FormData>(
    async (_, form) => {
      const saved = editor.document.get();
      if (!saved.scriptId || saved.isDirty)
        return {
          status: "failed",
          error: t("scripts.editor.dryRun.saveFirst"),
        };
      if (!transport || !selectedNode)
        return {
          status: "failed",
          error: t("scripts.editor.dryRun.unavailable"),
        };
      const controller = new AbortController();
      controllerRef.current = controller;
      let success: boolean | undefined;
      const addLog = (
        level: LogLevel,
        message: string,
        nodeId: string | null = null,
      ) => {
        const entry: LogEntry = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          level,
          message,
          nodeId,
        };
        setLogs((previous) => [...previous, entry].slice(-500));
      };
      try {
        const inputs = Object.fromEntries(
          triggerOutputs.map((port) => [
            port.id,
            String(form.get(port.id) ?? ""),
          ]),
        );
        const mockInputs = parseMockInputs(triggerOutputs, inputs);
        const client = createClient(ScriptService, transport);
        for await (const response of client.dryRunScript(
          {
            instanceId,
            scriptId: saved.scriptId,
            triggerNodeId: selectedNode.id,
            mockInputs,
          },
          { signal: controller.signal },
        )) {
          if (controller.signal.aborted) break;
          const event = response.event;
          switch (event.case) {
            case "nodeStarted":
              addLog(
                "debug",
                t("scripts.nodeStarted", { nodeId: event.value.nodeId }),
                event.value.nodeId,
              );
              break;
            case "nodeCompleted": {
              const outputs = Object.fromEntries(
                Object.entries(event.value.outputs).map(([key, value]) => [
                  key,
                  valueToJson(value),
                ]),
              );
              addLog(
                "debug",
                `${t("scripts.nodeCompleted", { nodeId: event.value.nodeId })}${Object.keys(outputs).length ? ` ${JSON.stringify(outputs)}` : ""}`,
                event.value.nodeId,
              );
              break;
            }
            case "nodeError":
              addLog("error", event.value.errorMessage, event.value.nodeId);
              break;
            case "scriptLog":
              addLog(
                ["debug", "info", "warn", "error"].includes(event.value.level)
                  ? (event.value.level as LogLevel)
                  : "info",
                event.value.message,
                event.value.nodeId ?? null,
              );
              break;
            case "executionStats":
              addLog(
                "info",
                t("scripts.editor.dryRun.stats", {
                  count: Number(event.value.nodeCount),
                }),
              );
              break;
            case "scriptCompleted":
              success = event.value.success;
              break;
          }
        }
        if (controller.signal.aborted)
          return { status: "cancelled", error: null };
        if (success === undefined)
          throw new Error(t("scripts.editor.dryRun.incomplete"));
        return { status: success ? "completed" : "failed", error: null };
      } catch (error) {
        if (controller.signal.aborted)
          return { status: "cancelled", error: null };
        const port =
          error instanceof InvalidMockInput
            ? triggerOutputs.find((port) => port.id === error.portId)
            : undefined;
        return {
          status: "failed",
          error: port
            ? t("scripts.editor.dryRun.invalidInput", {
                name: port.label,
                type: port.type,
              })
            : error instanceof Error
              ? error.message
              : String(error),
        };
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    { status: "idle", error: null },
  );

  if (triggerNodes.length === 0) return null;

  return (
    <Credenza
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) controllerRef.current?.abort();
      }}
    >
      <CredenzaTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("scripts.editor.dryRun.tooltip")}
            title={t("scripts.editor.dryRun.tooltip")}
          />
        }
      >
        <FlaskConical className="size-4" />
      </CredenzaTrigger>
      <CredenzaContent className="max-h-[90dvh] overflow-y-auto">
        <CredenzaHeader>
          <CredenzaTitle>{t("scripts.editor.dryRun.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("scripts.editor.dryRun.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <form
            action={run}
            onSubmit={() => setLogs([])}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor={`${id}-trigger`}>
                {t("scripts.editor.dryRun.triggerNode")}
              </FieldLabel>
              <Select
                items={triggerItems}
                value={selectedTrigger || null}
                onValueChange={(value) => {
                  setSelectedTrigger(value ?? "");
                  setMockInputs({});
                }}
                disabled={isPending}
              >
                <SelectTrigger id={`${id}-trigger`} className="w-full">
                  <SelectValue
                    placeholder={t("scripts.editor.dryRun.selectTrigger")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {triggerItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("scripts.editor.dryRun.triggerDescription")}
              </FieldDescription>
            </Field>
            {triggerOutputs.length > 0 && (
              <FieldDescription id={`${id}-hint`}>
                {t("scripts.editor.dryRun.inputHint")}
              </FieldDescription>
            )}
            {triggerOutputs.map((port) => (
              <Field key={`${selectedTrigger}:${port.id}`}>
                <FieldLabel htmlFor={`${id}-${port.id}`}>
                  {port.label}
                </FieldLabel>
                <Input
                  id={`${id}-${port.id}`}
                  name={port.id}
                  value={mockInputs[port.id] ?? ""}
                  onChange={(event) =>
                    setMockInputs((previous) => ({
                      ...previous,
                      [port.id]: event.target.value,
                    }))
                  }
                  aria-describedby={`${id}-hint`}
                  disabled={isPending}
                  placeholder={t("scripts.editor.dryRun.valuePlaceholder", {
                    type: port.type,
                  })}
                  className="h-8 text-sm"
                />
              </Field>
            ))}
            {needsSave && (
              <FieldDescription>
                {t("scripts.editor.dryRun.saveFirst")}
              </FieldDescription>
            )}
            {result.error && !isPending && (
              <FieldError>{result.error}</FieldError>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!selectedNode || needsSave || !transport || isPending}
                className="flex-1"
              >
                {isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                {t(
                  isPending
                    ? "scripts.editor.dryRun.running"
                    : "scripts.editor.dryRun.start",
                )}
              </Button>
              {isPending && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => controllerRef.current?.abort()}
                >
                  {t("scripts.editor.dryRun.cancel")}
                </Button>
              )}
            </div>
            {!isPending && result.status !== "idle" && (
              <p role="status" className="text-sm text-muted-foreground">
                {t(`scripts.editor.dryRun.${result.status}`)}
              </p>
            )}
            {logs.length > 0 && (
              <div className="h-48 min-w-0">
                <ExecutionLogs logs={logs} onClearLogs={() => setLogs([])} />
              </div>
            )}
          </form>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
