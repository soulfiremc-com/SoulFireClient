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
  const content = {
    instanceId,
    name: scriptId ? snapshot.name : snapshot.name || defaultName,
    description: snapshot.description,
    nodes: nodesToProto(snapshot.nodes),
    edges: edgesToProto(snapshot.edges),
    // Graph edits must not resume a script paused by another client.
    paused:
      scriptId && snapshot.paused === lastSavedPaused
        ? undefined
        : snapshot.paused,
    quotas: snapshot.quotas,
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
  editor.actions.markSaved(snapshot, result.script.id, result.script.paused);
  return result.script;
}
