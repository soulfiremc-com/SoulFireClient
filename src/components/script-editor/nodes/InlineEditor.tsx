import { type ComponentProps, memo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { PortType } from "./types";
import { displayText } from "@/lib/display-text";

/**
 * Number input that keeps partial text such as "-" or "" while typing.
 * Only parseable values reach onChange, and blur shows the stored value again.
 */
function DraftNumberInput({
  value,
  onChange,
  onBlur,
  ...props
}: Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        const num = Number.parseFloat(e.target.value);
        if (!Number.isNaN(num)) onChange(num);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}

interface InlineEditorProps {
  type: PortType;
  value: unknown;
  defaultValue: unknown;
  onChange: (value: unknown) => void;
  /** Accessible name, usually the port label next to the field. */
  label: string;
  className?: string;
}

type Vector3Value = { x?: number; y?: number; z?: number };

function asVector3(value: unknown): Vector3Value | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

/**
 * Inline editor component for node port values.
 * Renders different input types based on port type.
 * Used directly on nodes for Blender-style inline editing.
 */
function InlineEditorComponent({
  type,
  value,
  defaultValue,
  onChange,
  label,
  className,
}: InlineEditorProps) {
  // Use value if defined, otherwise fall back to default
  const currentValue = value ?? defaultValue;

  // Common input props to prevent node dragging/selection when editing
  const inputProps = {
    "aria-label": label,
    className: cn(
      "nodrag nopan rounded-sm border border-border/50 bg-muted/80 px-1.5 py-0.5 text-xs text-foreground",
      "focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none",
      "hover:border-border",
      className,
    ),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
    },
  };

  switch (type) {
    case "number":
      return (
        <DraftNumberInput
          value={typeof currentValue === "number" ? currentValue : 0}
          onChange={onChange}
          {...inputProps}
          className={cn(inputProps.className, "w-16 text-right")}
        />
      );

    case "string":
      return (
        <input
          type="text"
          value={typeof currentValue === "string" ? currentValue : ""}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="..."
          {...inputProps}
          className={cn(inputProps.className, "w-24")}
        />
      );

    case "boolean":
      return (
        <Checkbox
          checked={currentValue === true}
          aria-label={label}
          onCheckedChange={(checked) => {
            onChange(checked);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
          className="nodrag nopan"
        />
      );

    case "vector3":
      return (
        <Vector3Editor
          value={asVector3(value)}
          defaultValue={asVector3(defaultValue)}
          onChange={onChange}
          label={label}
        />
      );

    case "any":
    case "block":
    case "bot":
    case "collection":
    case "entity":
    case "execution":
    case "item":
    case "list":
    case "map":
    case "set":
    default:
      // For other types (entity, bot, block, item, list, any), show as text
      return (
        <input
          type="text"
          value={displayText(currentValue ?? "")}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder="..."
          {...inputProps}
          className={cn(inputProps.className, "w-20")}
        />
      );
  }
}

export const InlineEditor = memo(InlineEditorComponent);

/**
 * Vector3 inline editor with x, y, and z fields.
 */
interface Vector3EditorProps {
  value: Vector3Value | undefined;
  defaultValue: Vector3Value | undefined;
  onChange: (value: { x: number; y: number; z: number }) => void;
  label: string;
}

function Vector3EditorComponent({
  value,
  defaultValue,
  onChange,
  label,
}: Vector3EditorProps) {
  const current = value ?? defaultValue ?? { x: 0, y: 0, z: 0 };

  const inputProps = {
    className: cn(
      "nodrag nopan w-10 rounded-sm border border-border/50 bg-muted/80 px-1 py-0.5 text-right text-xs text-foreground",
      "focus:ring-1 focus:ring-primary focus:outline-none",
    ),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
    },
  };

  const handleChange = (axis: "x" | "y" | "z", num: number) => {
    onChange({
      x: current.x ?? 0,
      y: current.y ?? 0,
      z: current.z ?? 0,
      [axis]: num,
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      {(["x", "y", "z"] as const).map((axis) => (
        <DraftNumberInput
          key={axis}
          aria-label={`${label} ${axis.toUpperCase()}`}
          value={current[axis] ?? 0}
          onChange={(num) => {
            handleChange(axis, num);
          }}
          {...inputProps}
        />
      ))}
    </div>
  );
}

export const Vector3Editor = memo(Vector3EditorComponent);

/**
 * Dropdown select editor for ports with predefined options
 */
interface SelectEditorProps {
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectEditorComponent({
  value,
  options,
  onChange,
}: SelectEditorProps) {
  const inputProps = {
    className: cn(
      "nodrag nopan rounded-sm border border-border/50 bg-muted/80 px-1.5 py-0.5 text-xs text-foreground",
      "cursor-pointer focus:ring-1 focus:ring-primary focus:outline-none",
    ),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
    },
  };

  return (
    <select
      value={value ?? options[0]?.value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      {...inputProps}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export const SelectEditor = memo(SelectEditorComponent);
