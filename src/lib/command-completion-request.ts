import type { CommandCompletion } from "@/generated/soulfire/command_pb";

export class CommandCompletionRequest {
  private controller: AbortController | undefined;

  cancel() {
    this.controller?.abort();
    this.controller = undefined;
  }

  async run(load: (signal: AbortSignal) => Promise<CommandCompletion[]>) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    try {
      const suggestions = await load(controller.signal);
      return controller.signal.aborted
        ? undefined
        : { suggestions, signal: controller.signal };
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      return undefined;
    }
  }
}
