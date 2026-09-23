import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Editable,
  EditableArea,
  EditableInput,
  EditablePreview,
} from "@/components/ui/editable";
import { cn } from "@/lib/utils";
import { useNodeEditing } from "../NodeEditingContext";

interface EditableNodeLabelProps {
  nodeId: string;
  value: string;
  onSubmit: (value: string) => void;
  variant?: "default" | "muted" | "frame" | "selectedFrame" | "note";
}

/**
 * Shared inline-editable label for node titles.
 * Supports double-click to edit, Enter to submit, Escape to cancel.
 * Also responds to the renaming node ID from NodeEditingContext (F2 / context menu).
 */
function EditableNodeLabelComponent({
  nodeId,
  value,
  onSubmit,
  variant = "default",
}: EditableNodeLabelProps) {
  const { renamingNodeId, clearRenamingNodeId } = useNodeEditing();
  const [editing, setEditing] = useState(false);

  // Use a ref to always have the latest value for comparison in handleSubmit,
  // avoiding stale closure issues when the Editable component calls onSubmit
  // via propsRef after React re-renders.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Trigger edit mode when this node is targeted for rename (F2 / context menu)
  useEffect(() => {
    if (renamingNodeId === nodeId) {
      setEditing(true);
      clearRenamingNodeId();
    }
  }, [renamingNodeId, nodeId, clearRenamingNodeId]);

  const handleEditingChange = useCallback((isEditing: boolean) => {
    setEditing(isEditing);
  }, []);

  const handleSubmit = useCallback(
    (newValue: string) => {
      const trimmed = newValue.trim();
      if (trimmed && trimmed !== valueRef.current) {
        onSubmit(trimmed);
      }
      setEditing(false);
    },
    [onSubmit],
  );

  const labelClasses = cn(
    variant !== "note" && "text-sm font-medium",
    variant === "muted" && "line-through",
    variant === "frame" && "text-muted-foreground",
    variant === "selectedFrame" && "text-primary",
    variant === "note" && "text-sm font-semibold text-black/80",
  );

  return (
    <Editable
      value={value}
      editing={editing}
      onEditingChange={handleEditingChange}
      onSubmit={handleSubmit}
      triggerMode="dblclick"
      autosize
      className="min-w-0 flex-row items-center gap-0"
    >
      <EditableArea className="nodrag nopan min-w-0">
        <EditablePreview
          className={cn(
            "cursor-text truncate border-none px-0 py-0",
            labelClasses,
          )}
        />
        <EditableInput
          className={cn(
            "border-none bg-transparent px-0 py-0 shadow-none focus-visible:ring-0",
            labelClasses,
          )}
        />
      </EditableArea>
    </Editable>
  );
}

export const EditableNodeLabel = memo(EditableNodeLabelComponent);
