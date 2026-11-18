import type { ReactNode } from "react";
import type { ScriptEditorSession } from "@/stores/script-editor-store";
import { ScriptEditorContext } from "./script-editor-context.ts";

export function ScriptEditorProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: ScriptEditorSession;
}) {
  return <ScriptEditorContext value={session}>{children}</ScriptEditorContext>;
}
