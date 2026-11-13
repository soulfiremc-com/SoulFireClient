import { useEffect, useRef, useState } from "react";

/**
 * Runs one provider request at a time. Unmounting aborts the active request,
 * and an aborted request never reports an error.
 */
export function useProviderTask({
  onBusyChange,
  describeError,
}: {
  onBusyChange?: (busy: boolean) => void;
  describeError: (cause: unknown) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await task(request.signal);
    } catch (cause) {
      if (!request.signal.aborted) setError(describeError(cause));
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }

  return { busy, error, setError, run };
}
