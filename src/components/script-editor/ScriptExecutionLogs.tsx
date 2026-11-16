import { useSelector } from "@tanstack/react-store";
import { type ComponentProps, useCallback } from "react";
import { ExecutionLogs } from "./ExecutionLogs";
import { getNodeDisplayLabel } from "./node-label";
import { useScriptEditor } from "./ScriptEditorProvider";

export function ScriptExecutionLogs(
  props: Omit<ComponentProps<typeof ExecutionLogs>, "logs" | "getNodeLabel">,
) {
  const editor = useScriptEditor();
  const logs = useSelector(editor.execution, (state) => state.executionLogs);
  const nodes = useSelector(editor.document, (state) => state.nodes);
  const getNodeLabel = useCallback(
    (nodeId: string) => getNodeDisplayLabel(nodes, nodeId),
    [nodes],
  );
  return <ExecutionLogs {...props} logs={logs} getNodeLabel={getNodeLabel} />;
}
