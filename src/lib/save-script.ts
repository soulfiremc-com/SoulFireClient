import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import type { Transport } from "@connectrpc/connect";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { edgesToProto, nodesToProto } from "@/lib/script-service";
import type { createScriptEditorSession } from "@/stores/script-editor-store";

export async function saveScript(
  transport: Transport,
  instanceId: string,
  editor: ReturnType<typeof createScriptEditorSession>,
  defaultName: string,
) {
  const { scriptId, lastSavedPaused } = editor.document.get();
  const snapshot = editor.actions.getScriptData();
  const client = createRpcClient(ScriptService, transport);
  // The server rejects an empty name, so an untitled script saves as the
  // default name.
  const name = snapshot.name || defaultName;
  const content = {
    instanceId,
    name,
    description: snapshot.description,
    nodes: nodesToProto(snapshot.nodes),
    edges: edgesToProto(snapshot.edges),
    // Graph edits must not resume a script paused by another client.
    ...(scriptId && snapshot.paused === lastSavedPaused
      ? {}
      : { paused: snapshot.paused }),
    ...(snapshot.quotas && { quotas: snapshot.quotas }),
  };
  const result = scriptId
    ? await Effect.runPromise(
        client.updateScript({
          ...content,
          scriptId,
          updateNodes: true,
          updateEdges: true,
          updateQuotas: true,
        }),
      )
    : await Effect.runPromise(client.createScript(content));
  if (!result.script)
    throw new Error("The server did not return the saved script.");
  // Show the saved name, unless the user renamed the script during the save.
  if (
    name !== snapshot.name &&
    editor.document.get().scriptName === snapshot.name
  )
    editor.actions.setScriptName(name);
  editor.actions.markSaved(
    { ...snapshot, name },
    result.script.id,
    result.script.paused,
  );
  return result.script;
}
