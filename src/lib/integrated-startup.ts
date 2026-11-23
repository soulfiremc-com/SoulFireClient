import type { DesktopIntegratedServerCredentials } from "@/lib/desktop-api";

export interface IntegratedStartupCallbacks {
  onReady: (credentials: DesktopIntegratedServerCredentials) => Promise<void>;
  onError: () => void;
}

interface Attempt extends IntegratedStartupCallbacks {
  cancelled: boolean;
  done: Promise<void>;
}

/**
 * Runs one local server startup at a time. Cancelling stops the process and
 * drops the result, so a server that finishes starting after the user
 * cancelled does not sign them in.
 */
export function createIntegratedStartup(api: {
  kill: () => Promise<void>;
  /** Resolves null when another window or process stopped the startup. */
  run: () => Promise<DesktopIntegratedServerCredentials | null>;
}) {
  let current: Attempt | null = null;

  async function runAttempt(attempt: Attempt) {
    try {
      // Stop a server left over from an earlier session first.
      await api.kill();
      if (attempt.cancelled) return;
      const credentials = await api.run();
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- cancel() sets this while run() waits
      if (attempt.cancelled) return;
      if (credentials === null) {
        attempt.onError();
        return;
      }
      await attempt.onReady(credentials);
    } catch (error) {
      if (!attempt.cancelled) {
        // The failure card explains this, with recovery actions.
        console.error(error);
        attempt.onError();
      }
    } finally {
      if (current === attempt) current = null;
    }
  }

  return {
    /** Starts the server. A call while a startup runs does nothing. */
    start(callbacks: IntegratedStartupCallbacks) {
      if (current) return;
      const attempt: Attempt = {
        ...callbacks,
        cancelled: false,
        done: Promise.resolve(),
      };
      current = attempt;
      attempt.done = runAttempt(attempt);
    },
    /**
     * Stops the running startup and waits until it ends. If the process cannot
     * be stopped, the startup keeps reporting its result and this rejects.
     */
    async cancel() {
      const attempt = current;
      if (attempt) attempt.cancelled = true;
      try {
        await api.kill();
      } catch (error) {
        if (attempt) {
          attempt.cancelled = false;
          // The attempt already ended and dropped its result, so report a
          // failure instead of leaving the user on the loading screen.
          if (current !== attempt) attempt.onError();
        }
        throw error;
      }
      await attempt?.done;
    },
  };
}

export type IntegratedStartup = ReturnType<typeof createIntegratedStartup>;
