import { createContext, type ReactNode, use } from "react";
import type { ScriptEditorSession } from "@/stores/script-editor-store";

const ScriptEditorContext = createContext<ScriptEditorSession | null>(null);

export function ScriptEditorProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: ScriptEditorSession;
}) {
  return <ScriptEditorContext value={session}>{children}</ScriptEditorContext>;
}

export function useScriptEditor() {
  const session = use(ScriptEditorContext);
  if (!session) throw new Error("Script editor session is missing");
  return session;
}
