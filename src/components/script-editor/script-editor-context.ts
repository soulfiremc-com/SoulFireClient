import { type Context, createContext, use } from "react";
import type { ScriptEditorSession } from "@/stores/script-editor-store";

type ScriptEditorContextValue = Context<ScriptEditorSession | null>;

// Hot updates re-run this module. Reuse the context so mounted providers and
// re-imported consumers keep matching each other.
export const ScriptEditorContext: ScriptEditorContextValue =
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Vite hot module data keeps the context object from the previous module instance
  (import.meta.hot?.data.context as ScriptEditorContextValue | undefined) ??
  createContext<ScriptEditorSession | null>(null);
if (import.meta.hot) import.meta.hot.data.context = ScriptEditorContext;

export function useScriptEditor() {
  const session = use(ScriptEditorContext);
  if (!session) throw new Error("Script editor session is missing");
  return session;
}
