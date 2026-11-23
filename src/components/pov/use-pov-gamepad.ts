import { type RefObject, useEffect } from "react";
import { PovGamepad } from "@/lib/pov-gamepad";
import type { PovSession } from "@/lib/pov-session";
import type { PovPlayerStore } from "@/stores/pov-player-store";

// Poll gamepads only while the user controls the bot. An idle loop would
// wake the browser on every display refresh.
export function usePovGamepad({
  canvas,
  captured,
  playerStore,
  sessionRef,
  release,
}: {
  canvas: HTMLCanvasElement | null;
  captured: boolean;
  playerStore: PovPlayerStore;
  sessionRef: RefObject<PovSession | null>;
  release: () => void;
}) {
  useEffect(() => {
    const win = canvas?.ownerDocument.defaultView;
    if (!win || !captured) return undefined;
    const gamepad = new PovGamepad();
    let padTime = win.performance.now();
    let padFrame = 0;
    const pollPad = (now: number) => {
      const seconds = Math.min(0.05, (now - padTime) / 1000);
      padTime = now;
      if (playerStore.get().connected) {
        const pad =
          Array.from(win.navigator.getGamepads()).find(
            (connectedPad) =>
              connectedPad?.connected && connectedPad.mapping === "standard",
          ) ?? null;
        // Back and Start together release control, like the keyboard shortcut.
        if (pad?.buttons[8]?.pressed && pad.buttons[9]?.pressed) {
          release();
          return;
        }
        for (const event of gamepad.sample(
          pad,
          seconds,
          playerStore.get().screenOpen,
        ))
          sessionRef.current?.enqueue(event, "gamepad");
      } else gamepad.reset();
      padFrame = win.requestAnimationFrame(pollPad);
    };
    padFrame = win.requestAnimationFrame(pollPad);
    return () => {
      win.cancelAnimationFrame(padFrame);
    };
  }, [canvas, captured, release, playerStore, sessionRef]);
}
