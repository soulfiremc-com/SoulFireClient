import { useSelector } from "@tanstack/react-store";
import { type ComponentProps, useCallback } from "react";
import { ExecutionLogs } from "./ExecutionLogs";
import { getNodeDisplayLabel, sameNodeLabels } from "./node-label";
import { useScriptEditor } from "./script-editor-context";

export function ScriptExecutionLogs(
  props: Omit<ComponentProps<typeof ExecutionLogs>, "logs" | "getNodeLabel">,
) {
  const editor = useScriptEditor();
  const logs = useSelector(editor.execution, (state) => state.executionLogs);
  // Only label changes affect the log, not node moves.
  const nodes = useSelector(editor.document, (state) => state.nodes, {
    compare: sameNodeLabels,
  });
  const getNodeLabel = useCallback(
    (nodeId: string) => getNodeDisplayLabel(nodes, nodeId),
    [nodes],
  );
  return <ExecutionLogs {...props} logs={logs} getNodeLabel={getNodeLabel} />;
}
