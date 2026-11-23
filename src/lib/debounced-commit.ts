/** How long a settings field waits after the last edit before it saves. */
export const SETTING_SAVE_DELAY_MS = 400;

/**
 * Holds the latest edit and commits it once typing pauses. A flush commits a
 * held edit at once, so blur, Enter, and unmount never drop what was typed.
 */
export class DebouncedCommit<T> {
  readonly #delayMs: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #held: { value: T; commit: (value: T) => void } | undefined;

  constructor(delayMs: number) {
    this.#delayMs = delayMs;
  }

  schedule(value: T, commit: (value: T) => void) {
    this.#held = { value, commit };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.flush();
    }, this.#delayMs);
  }

  flush() {
    const held = this.#held;
    this.cancel();
    held?.commit(held.value);
  }

  cancel() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#held = undefined;
  }
}

/**
 * Flushes the saver when the page is hidden or unloaded, and once more when
 * the returned cleanup runs. Returns the cleanup.
 */
export function flushWhenPageHides(
  saver: { flush: () => void },
  target: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  > = document,
  pageTarget: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
  const onVisibilityChange = () => {
    if (target.visibilityState === "hidden") saver.flush();
  };
  const onPageHide = () => {
    saver.flush();
  };
  target.addEventListener("visibilitychange", onVisibilityChange);
  pageTarget.addEventListener("pagehide", onPageHide);
  return () => {
    target.removeEventListener("visibilitychange", onVisibilityChange);
    pageTarget.removeEventListener("pagehide", onPageHide);
    saver.flush();
  };
}
