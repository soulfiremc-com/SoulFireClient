import { createClient, type Transport } from "@connectrpc/connect";
import { ScriptService } from "@/generated/soulfire/script_pb";

export async function resumeScript(
  transport: Transport,
  instanceId: string,
  scriptId: string,
): Promise<void> {
  const controller = new AbortController();
  try {
    const client = createClient(ScriptService, transport);
    for await (const event of client.activateScript(
      { instanceId, scriptId },
      { signal: controller.signal },
    )) {
      if (event.event.case === "scriptStarted") {
        controller.abort();
        return;
      }
    }
    throw new Error(
      "The server ended script activation without confirming it.",
    );
  } finally {
    // The script keeps running when its monitoring stream disconnects.
    controller.abort();
  }
}
