import { type NodeProps, NodeResizer } from "@xyflow/react";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useNodeEditing } from "../NodeEditingContext";
import { EditableNodeLabel } from "./EditableNodeLabel";

export interface NoteNodeData {
  /** Label displayed in the header */
  label?: string;
  /** Multiline text content */
  content?: string;
  /** Background color (hex) */
  color?: string;
  [key: string]: unknown;
}

interface NoteNodeProps extends NodeProps {
  data: NoteNodeData;
}

function NoteNodeComponent({ id, data, selected }: NoteNodeProps) {
  const { t } = useTranslation("instance");
  const { updateNodeData } = useNodeEditing();
  const label = data.label ?? "Note";
  const content = data.content ?? "";
  const backgroundColor = data.color ?? "#fbbf24";

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleLabelSubmit = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  return (
    <>
      <NodeResizer
        minWidth={150}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-none"
      />

      <div
        className={cn(
          "flex h-full w-full flex-col rounded-lg shadow-md",
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
        style={{
          backgroundColor,
          minWidth: 150,
          minHeight: 100,
        }}
      >
        {/* Header */}
        <div className="flex items-center border-b border-black/10 px-3 py-1.5">
          <EditableNodeLabel
            nodeId={id}
            value={label}
            onSubmit={handleLabelSubmit}
            variant="note"
          />
        </div>

        {/* Content area */}
        <textarea
          className="nodrag nopan w-full flex-1 resize-none bg-transparent p-3 text-sm text-black/70 outline-none placeholder:text-black/30"
          value={content}
          onChange={handleContentChange}
          placeholder={t("scripts.editor.note.placeholder")}
        />
      </div>
    </>
  );
}

export const NoteNode = memo(NoteNodeComponent);
