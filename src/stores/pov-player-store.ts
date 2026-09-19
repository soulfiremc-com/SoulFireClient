import { createStore } from "@tanstack/store";

interface PovPlayerState {
  playing: boolean;
  autoStart: boolean;
  connected: boolean;
  screenOpen: boolean;
  capture: "idle" | "pending" | "captured";
  error: string | null;
  captureError: string | null;
  retry: number;
  fullscreen: boolean;
}

export function createPovPlayerStore() {
  let captureAttempt = 0;
  return createStore(
    {
      playing: true,
      autoStart: true,
      connected: false,
      screenOpen: false,
      capture: "idle",
      error: null,
      captureError: null,
      retry: 0,
      fullscreen: false,
    } as PovPlayerState,
    (store) => ({
      setPlaying(playing: boolean) {
        store.setState((state) => ({ ...state, playing, autoStart: playing }));
      },
      consumeAutoStart() {
        store.setState((state) => ({ ...state, autoStart: false }));
      },
      connecting() {
        store.setState((state) => ({
          ...state,
          connected: false,
          error: null,
          screenOpen: false,
        }));
      },
      disconnected() {
        store.setState((state) =>
          state.connected ? { ...state, connected: false } : state,
        );
      },
      framePresented(screenOpen: boolean) {
        const changed = store.get().screenOpen !== screenOpen;
        store.setState((state) =>
          state.connected && state.screenOpen === screenOpen
            ? state
            : { ...state, connected: true, screenOpen },
        );
        return changed;
      },
      setError(error: string | null) {
        store.setState((state) => ({ ...state, error }));
      },
      reconnect() {
        store.setState((state) => ({
          ...state,
          error: null,
          retry: state.retry + 1,
        }));
      },
      setFullscreen(fullscreen: boolean) {
        store.setState((state) =>
          state.fullscreen === fullscreen ? state : { ...state, fullscreen },
        );
      },
      beginCapture() {
        if (!store.get().connected || store.get().capture !== "idle")
          return null;
        const attempt = ++captureAttempt;
        store.setState((state) => ({
          ...state,
          capture: "pending",
          captureError: null,
        }));
        return attempt;
      },
      isCurrentCapture(attempt: number) {
        return attempt === captureAttempt;
      },
      completeCapture(attempt: number) {
        if (attempt !== captureAttempt || !store.get().connected) return false;
        store.setState((state) => ({ ...state, capture: "captured" }));
        return true;
      },
      releaseCapture() {
        captureAttempt++;
        store.setState((state) =>
          state.capture === "idle" ? state : { ...state, capture: "idle" },
        );
      },
      setCaptureError(captureError: string) {
        store.setState((state) => ({ ...state, captureError }));
      },
    }),
  );
}
