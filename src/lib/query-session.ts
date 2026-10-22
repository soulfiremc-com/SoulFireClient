import { broadcastQueryClient } from "@tanstack/query-broadcast-client-experimental";
import type { QueryClient } from "@tanstack/react-query";

const SESSION_KEY = "query-session:v1";
const SESSION_CHANGE_EVENT = "soulfire:query-session-change";

export function getQuerySessionId() {
  const saved = window.localStorage.getItem(SESSION_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}

export function resetQuerySession() {
  window.localStorage.setItem(SESSION_KEY, crypto.randomUUID());
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export function synchronizeQuerySession(queryClient: QueryClient) {
  let sessionId = getQuerySessionId();
  let stopBroadcast: (() => void) | undefined = broadcastQueryClient({
    queryClient,
    broadcastChannel: `soulfire-${sessionId}`,
  });
  const disconnect = () => {
    stopBroadcast?.();
    stopBroadcast = undefined;
  };
  const discardPreviousSession = () => {
    const current = getQuerySessionId();
    if (current === sessionId) return false;
    sessionId = current;
    disconnect();
    queryClient.clear();
    return true;
  };
  const onLocalChange = () => {
    discardPreviousSession();
  };
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea !== window.localStorage ||
      (event.key !== SESSION_KEY && event.key !== null)
    )
      return;
    if (discardPreviousSession()) window.location.reload();
  };
  window.addEventListener(SESSION_CHANGE_EVENT, onLocalChange);
  window.addEventListener("storage", onStorage);
  return () => {
    disconnect();
    window.removeEventListener(SESSION_CHANGE_EVENT, onLocalChange);
    window.removeEventListener("storage", onStorage);
  };
}
