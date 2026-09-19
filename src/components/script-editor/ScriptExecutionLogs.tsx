import { useSelector } from "@tanstack/react-store";
import type { ComponentProps } from "react";
import { ExecutionLogs } from "./ExecutionLogs";
import { useScriptEditor } from "./ScriptEditorProvider";

export function ScriptExecutionLogs(
  props: Omit<ComponentProps<typeof ExecutionLogs>, "logs">,
) {
  const editor = useScriptEditor();
  const logs = useSelector(editor.execution, (state) => state.executionLogs);
  return <ExecutionLogs {...props} logs={logs} />;
}
