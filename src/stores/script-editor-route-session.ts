import { createScriptEditorSession } from "./script-editor-store";

export interface ScriptEditorRouteSession {
  instanceId: string;
  scriptId: string;
  key: string;
  editor: ReturnType<typeof createScriptEditorSession>;
}

export function getScriptEditorRouteSession(
  current: ScriptEditorRouteSession | undefined,
  instanceId: string,
  scriptId: string,
): ScriptEditorRouteSession {
  if (current?.instanceId === instanceId) {
    if (current.scriptId === scriptId) return current;
    if (
      current.scriptId === "new" &&
      current.editor.document.get().scriptId === scriptId
    )
      return { ...current, scriptId };
  }
  return {
    instanceId,
    scriptId,
    key: crypto.randomUUID(),
    editor: createScriptEditorSession(),
  };
}
