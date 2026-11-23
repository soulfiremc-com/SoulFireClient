import { type RefObject, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { desktop, isDesktopApp, isMac } from "@/lib/desktop";
import { lockPovPointer, PovPointerLockError } from "@/lib/pov-pointer-lock";
import type { PovSession } from "@/lib/pov-session";
import type { PovPlayerStore } from "@/stores/pov-player-store";

export type KeyboardCapture = Navigator & {
  keyboard?: { lock(keys?: string[]): Promise<void>; unlock(): void };
};

/** Keys that Keyboard Lock keeps from the browser so Minecraft receives them. */
export const POV_LOCKED_KEYS = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Tab",
  "Space",
  "Escape",
];

export const POV_RELEASE_SHORTCUT = isMac ? "Cmd+Shift+G" : "Ctrl+Shift+G";

export function usePovCapture({
  playerStore,
  sessionRef,
  canvas,
  canvasRef,
  rootRef,
  textInputRef,
  touch,
  connected,
  toasterId,
}: {
  playerStore: PovPlayerStore;
  sessionRef: RefObject<PovSession | null>;
  canvas: HTMLCanvasElement | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  touch: boolean;
  connected: boolean;
  toasterId: string;
}) {
  const { t } = useTranslation("instance");
  const actions = playerStore.actions;
  const nativeCaptureTarget = useRef<"pov" | undefined>(undefined);
  // Mouse buttons pressed on the view. A release forgets them.
  const heldMouseButtonsRef = useRef(new Set<number>());

  const release = useCallback(() => {
    heldMouseButtonsRef.current.clear();
    actions.releaseCapture();
    toast.dismiss(toasterId);
    sessionRef.current?.capture(false);
    const textInput = textInputRef.current;
    if (textInput) {
      textInput.value = "";
      textInput.blur();
    }
    if (isDesktopApp())
      void desktop.pov
        .setCaptured(false, nativeCaptureTarget.current)
        .catch(console.error);
    const doc = canvasRef.current?.ownerDocument;
    if (doc?.pointerLockElement) doc.exitPointerLock();
    if (doc?.fullscreenElement === rootRef.current && doc.fullscreenElement) {
      void doc.exitFullscreen().catch(() => {});
    }
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc needs the cast because its DOM lib has no Navigator.keyboard
    const navigator = doc?.defaultView?.navigator as
      | KeyboardCapture
      | undefined;
    navigator?.keyboard?.unlock();
  }, [toasterId, actions, sessionRef, textInputRef, canvasRef, rootRef]);

  const capture = useCallback(async () => {
    if (!canvas || !connected || !canvas.ownerDocument.hasFocus()) return;
    const attempt = actions.beginCapture();
    if (attempt === null) return;
    try {
      nativeCaptureTarget.current =
        canvas.ownerDocument === document ? undefined : "pov";
      if (isDesktopApp())
        await desktop.pov.setCaptured(true, nativeCaptureTarget.current);
      if (!actions.isCurrentCapture(attempt)) return;
      if (!touch) {
        if (playerStore.get().screenOpen)
          textInputRef.current?.focus({ preventScroll: true });
        else await lockPovPointer(canvas);
      }
      if (!actions.isCurrentCapture(attempt)) return;
      if (canvasRef.current !== canvas || !actions.completeCapture(attempt)) {
        release();
        return;
      }
      sessionRef.current?.capture(true);
      if (!touch)
        toast.info(
          t("instance:bots.pov.releaseHint", {
            shortcut: POV_RELEASE_SHORTCUT,
          }),
          {
            id: toasterId,
            toasterId,
            duration: 4000,
            style: { pointerEvents: "none" },
          },
        );
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsc needs the cast because its DOM lib has no Navigator.keyboard
      const navigator = canvas.ownerDocument.defaultView?.navigator as
        | KeyboardCapture
        | undefined;
      // Where supported, allow Minecraft to receive Escape in fullscreen.
      void navigator?.keyboard?.lock(POV_LOCKED_KEYS).catch(() => {});
    } catch (cause) {
      if (!actions.isCurrentCapture(attempt)) return;
      release();
      actions.setCaptureError(
        cause instanceof PovPointerLockError && cause.reason === "cooldown"
          ? t("instance:bots.pov.captureCooldown")
          : cause instanceof PovPointerLockError && cause.reason === "timeout"
            ? t("instance:bots.pov.captureTimeout")
            : cause instanceof Error && !(cause instanceof PovPointerLockError)
              ? `${cause.message} ${t("instance:bots.pov.captureHint")}`
              : t("instance:bots.pov.captureHint"),
      );
    }
  }, [
    canvas,
    connected,
    toasterId,
    release,
    touch,
    actions,
    playerStore,
    sessionRef,
    textInputRef,
    canvasRef,
    t,
  ]);

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (root.ownerDocument.fullscreenElement)
        await root.ownerDocument.exitFullscreen();
      else {
        // Raw pointer input may need an asynchronous fallback. Finish capture
        // before fullscreen consumes the gesture needed by that retry.
        if (connected) await capture();
        await root.requestFullscreen();
      }
    } catch {
      toast.error(t("instance:bots.pov.fullscreenUnavailable"), { toasterId });
    }
  }

  return { release, capture, toggleFullscreen, heldMouseButtonsRef };
}
