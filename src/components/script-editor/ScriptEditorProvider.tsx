import { createContext, type ReactNode, use, useState } from "react";
import {
  createScriptEditorSession,
  type ScriptEditorSession,
} from "@/stores/script-editor-store";

const ScriptEditorContext = createContext<ScriptEditorSession | null>(null);

export function ScriptEditorProvider({ children }: { children: ReactNode }) {
  const [session] = useState(createScriptEditorSession);
  return <ScriptEditorContext value={session}>{children}</ScriptEditorContext>;
}

export function useScriptEditor() {
  const session = use(ScriptEditorContext);
  if (!session) throw new Error("Script editor session is missing");
  return session;
}
