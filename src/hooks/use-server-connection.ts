import { useEffect, useRef, useState } from "react";
import { verifyServerConnection } from "@/lib/server-connection";

export function useServerConnection(
  onConnected: (address: string, token: string) => Promise<void>,
) {
  const active = useRef<AbortController | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function connect(address: string, token: string) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setConnecting(true);
    setError(null);
    try {
      const normalizedAddress = await verifyServerConnection(
        address,
        token,
        controller.signal,
      );
      if (!controller.signal.aborted)
        await onConnected(normalizedAddress, token.trim());
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason);
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setConnecting(false);
      }
    }
  }

  return { connect, connecting, error };
}
