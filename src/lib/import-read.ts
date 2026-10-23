export class ImportReadSession {
  private controller: AbortController | undefined;

  cancel() {
    this.controller?.abort();
    this.controller = undefined;
  }

  async run(
    read: (signal: AbortSignal) => Promise<readonly string[]>,
    accept: (texts: readonly string[]) => void,
  ) {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    try {
      let texts: readonly string[];
      try {
        texts = await read(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        throw error;
      }
      if (controller.signal.aborted) return;
      accept(texts);
    } finally {
      controller.abort();
      if (this.controller === controller) this.controller = undefined;
    }
  }
}

export function readImportFile(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    reader.onload = () => {
      cleanup();
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      cleanup();
      reject(reader.error);
    };
    reader.onabort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      reader.readAsText(file);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
