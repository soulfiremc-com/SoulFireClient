import { useSelector } from "@tanstack/react-store";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Bug, Copy, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getPortColor, type PortType } from "./types";
import { displayText } from "@/lib/display-text";

export interface DebugNodeData {
  /** Custom label for the debug node */
  label?: string;
  /** The resolved type based on input connection */
  resolvedType?: PortType;
  /** Whether to log values to execution logs */
  logToConsole?: boolean;
  [key: string]: unknown;
}

interface DebugNodeProps extends NodeProps {
  data: DebugNodeData;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(3);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    if (value.length > 50) {
      return `"${value.slice(0, 47)}..."`;
    }
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3) {
      return `[${value.map((item) => formatValue(item)).join(", ")}]`;
    }
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    if (entries.length <= 2) {
      return `{${entries.map(([k, entry]) => `${k}: ${formatValue(entry)}`).join(", ")}}`;
    }
    return `{${entries.length} keys}`;
  }

  return displayText(value);
}

/**
 * Format timestamp relative to now
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 1000) return "now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return date.toLocaleTimeString();
}

/**
 * DebugNode - A viewer/debug node for inspecting values during execution.
 * Shows live values flowing through the script with history.
 */
function DebugNodeComponent({ id, data, selected }: DebugNodeProps) {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const resolvedType = data.resolvedType ?? "any";
  const color = getPortColor(resolvedType);
  const label = data.label ?? "Debug";

  // Get debug history from store
  const history = useSelector(
    editor.execution,
    (s) => s.debugNodeValues.get(id) ?? EMPTY_DEBUG_HISTORY,
  );
  const clearDebugValues = editor.actions.clearDebugValues;

  const currentValue = history.length > 0 ? history.at(-1) : null;

  const handleClear = useCallback(() => {
    clearDebugValues(id);
  }, [clearDebugValues, id]);

  const handleCopyValue = useCallback(() => {
    if (currentValue) {
      navigator.clipboard
        .writeText(JSON.stringify(currentValue.value, null, 2))
        .catch((error: unknown) => {
          console.error("Could not copy the debug value", error);
        });
    }
  }, [currentValue]);

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border-2 bg-card shadow-md",
        "border-warning/50",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-warning/10 px-3 py-2">
        <Bug className="size-4 text-warning" />
        <span className="flex-1 text-sm font-medium">{label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={handleCopyValue}
          disabled={!currentValue}
          title={t("scripts.editor.debug.copyValue")}
        >
          <Copy className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={handleClear}
          disabled={history.length === 0}
          title={t("scripts.editor.debug.clearHistory")}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Ports */}
      <div className="p-2">
        <div className="flex items-center justify-between">
          {/* Input */}
          <div className="flex items-center gap-2">
            <Handle
              type="target"
              position={Position.Left}
              id="in"
              className="relative! top-0! transform-none! transition-transform hover:scale-125"
              style={{
                background: color,
                width: 8,
                height: 8,
                border: "2px solid var(--background)",
                borderRadius: "50%",
              }}
            />
            <span className="text-xs text-muted-foreground">In</span>
          </div>

          {/* Output (pass-through) */}
          <div className="flex flex-row-reverse items-center gap-2">
            <Handle
              type="source"
              position={Position.Right}
              id="out"
              className="relative! top-0! transform-none! transition-transform hover:scale-125"
              style={{
                background: color,
                width: 8,
                height: 8,
                border: "2px solid var(--background)",
                borderRadius: "50%",
              }}
            />
            <span className="text-xs text-muted-foreground">Out</span>
          </div>
        </div>
      </div>

      {/* Current Value Display */}
      <div className="px-2 pb-2">
        <div className="rounded-sm bg-muted/50 p-2">
          {currentValue ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                {t("scripts.editor.debug.current", {
                  time: formatTime(currentValue.timestamp),
                })}
              </div>
              <div className="font-mono text-sm break-all">
                {formatValue(currentValue.value)}
              </div>
            </div>
          ) : (
            <Empty className="border-0 p-2">
              <EmptyHeader className="gap-1">
                <EmptyTitle className="text-xs text-muted-foreground">
                  {t("scripts.editor.debug.noValue")}
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      {/* History (collapsed by default, shows last 5) */}
      {history.length > 1 && (
        <div className="border-t border-border/50 p-2">
          <div className="mb-1 text-xs text-muted-foreground">
            History ({history.length} values)
          </div>
          <ScrollArea className="h-[80px]">
            <div className="space-y-1">
              {history
                .slice(-5)
                .toReversed()
                .map((entry) => (
                  <div
                    key={`${entry.timestamp.getTime()}-${formatValue(entry.value)}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {formatTime(entry.timestamp)}
                    </span>
                    <span className="truncate font-mono">
                      {formatValue(entry.value)}
                    </span>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export const DebugNode = memo(DebugNodeComponent);

const EMPTY_DEBUG_HISTORY: { value: unknown; timestamp: Date }[] = [];
