interface ClosableWindow {
  close: () => void;
  isDestroyed: () => boolean;
}

/**
 * Quits in two steps. It closes the main window first, so the renderer can ask
 * about unsaved changes. Cleanup that stops bots and the integrated server
 * runs only after the window closes.
 */
export function createQuitFlow({
  getWindow,
  cleanup,
  quit,
}: {
  getWindow: () => ClosableWindow | null;
  cleanup: () => Promise<void>;
  quit: () => void;
}) {
  let quitAfterClose = false;
  let cleanupPromise: Promise<void> | null = null;
  let ready = false;
  // Replaces the final quit, for example to install an update. Installers
  // start at once, so they must run only after the user confirmed the close
  // and cleanup finished.
  let finish: (() => void) | null = null;

  return {
    /** Handles `before-quit`. Returns true when the quit must wait. */
    beforeQuit(): boolean {
      if (ready) return false;
      const window = getWindow();
      if (window !== null && !window.isDestroyed()) {
        quitAfterClose = true;
        window.close();
        return true;
      }
      cleanupPromise ??= (async () => {
        await cleanup();
        ready = true;
        (finish ?? quit)();
      })();
      return true;
    },
    /** Quits like `quit`, but calls `onReady` instead of the final quit. */
    quitWith(onReady: () => void): void {
      finish = onReady;
      quit();
    },
    /** True after the window closed for a quit and cleanup has started. */
    isQuitting(): boolean {
      return cleanupPromise !== null;
    },
    /** The user chose to stay, so the pending quit is cancelled. */
    closeCancelled(): void {
      quitAfterClose = false;
      if (cleanupPromise === null) finish = null;
    },
    windowClosed(): void {
      if (!quitAfterClose) return;
      quitAfterClose = false;
      quit();
    },
  };
}
