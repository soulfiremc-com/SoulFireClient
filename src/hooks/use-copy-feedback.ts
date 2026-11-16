import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which copy control was used last so it can show a check mark near
 * the click. A toast alone appears far from small copy buttons.
 */
export function useCopyFeedback(durationMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const markCopied = useCallback(
    (key: string) => {
      window.clearTimeout(timer.current);
      setCopiedKey(key);
      timer.current = window.setTimeout(() => setCopiedKey(null), durationMs);
    },
    [durationMs],
  );
  return [copiedKey, markCopied] as const;
}
