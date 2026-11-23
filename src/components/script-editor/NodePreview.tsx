import { memo } from "react";
import { useTranslation } from "react-i18next";
import { displayText } from "@/lib/display-text";

interface NodePreviewProps {
  /** The preview values to display (output port ID -> value) */
  values: Record<string, unknown>;
  /** Whether the preview is enabled */
  enabled: boolean;
}

/**
 * NodePreview - Blender-style inline output preview
 * Shows computed output values directly on the node during execution.
 */
function NodePreviewComponent({ values, enabled }: NodePreviewProps) {
  const { t } = useTranslation("instance");
  if (!enabled || Object.keys(values).length === 0) return null;

  return (
    <div className="border-t border-border/50 bg-muted/30 px-2 py-1">
      <div className="mb-1 text-xs text-muted-foreground">
        {t("scripts.editor.node.preview")}
      </div>
      <div className="flex flex-col gap-0.5">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {formatPortName(key)}:
            </span>
            <span
              className="max-w-[120px] truncate font-mono"
              title={formatValue(value)}
            >
              {formatValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Format a port ID into a readable name.
 * Port IDs are now simple names (e.g., "interval", "message").
 */
function formatPortName(portId: string): string {
  // Convert to title case (handle snake_case and kebab-case)
  return portId
    .split(/[-_]/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format a value for display in the preview
 */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (typeof value === "number") {
    // Format numbers nicely
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(3);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "string") {
    if (value.length > 20) {
      return `"${value.slice(0, 17)}..."`;
    }
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    return "{...}";
  }

  return displayText(value);
}

export const NodePreview = memo(NodePreviewComponent);
