import { type Context, createContext, type ReactNode, use } from "react";
import type { ScriptEditorSession } from "@/stores/script-editor-store";

type ScriptEditorContextValue = Context<ScriptEditorSession | null>;

// Hot updates re-run this module. Reuse the context so mounted providers and
// re-imported consumers keep matching each other.
const ScriptEditorContext: ScriptEditorContextValue =
  (import.meta.hot?.data.context as ScriptEditorContextValue | undefined) ??
  createContext<ScriptEditorSession | null>(null);
if (import.meta.hot) import.meta.hot.data.context = ScriptEditorContext;

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
