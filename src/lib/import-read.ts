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
    const abort = () => {
      reader.abort();
    };
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
    };
    reader.addEventListener("load", () => {
      cleanup();
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      cleanup();
      reject(reader.error ?? new Error("Could not read the file"));
    });
    reader.addEventListener("abort", () => {
      cleanup();
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- AbortSignal.reason is typed any; it holds the abort reason
      reject(signal.reason);
    });
    signal.addEventListener("abort", abort, { once: true });
    try {
      // oxlint-disable-next-line unicorn/prefer-blob-reading-methods -- readAsText honors UTF-16 byte order marks and can be aborted, Blob.text() always decodes UTF-8
      reader.readAsText(file);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
