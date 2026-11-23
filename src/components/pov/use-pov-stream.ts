import { Code, ConnectError } from "@connectrpc/connect";
import { useQueryClient } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { type RefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAsRef } from "@/hooks/use-as-ref";
import {
  copyMinecraftText,
  openMinecraftUrl,
} from "@/lib/minecraft-client-actions";
import { povCursor } from "@/lib/pov-cursor";
import { povDisplayFps } from "@/lib/pov-display";
import { lockPovPointer } from "@/lib/pov-pointer-lock";
import { PovPresenter } from "@/lib/pov-presenter";
import { povRenderSize } from "@/lib/pov-render-size";
import { type PovSession, startPovSession } from "@/lib/pov-session";
import { PovStreamFeedbackTracker } from "@/lib/pov-stream-feedback";
import type { PovStreamMetrics } from "@/lib/pov-stream-metrics";
import { PovVideoDecoder } from "@/lib/pov-video-decoder";
import { createTransport, povInputUrl } from "@/lib/web-rpc";
import { isCaptured, type PovPlayerStore } from "@/stores/pov-player-store";
import type { PovAudio } from "./use-pov-audio";

// Runs one POV session while the user watches an online bot. The session
// reconnects on its own. A retry from the store starts a fresh one.
export function usePovStream({
  instanceId,
  botId,
  isOnline,
  playerStore,
  sessionRef,
  canvas,
  canvasRef,
  textInputRef,
  presenterRef,
  unlockingForScreenRef,
  release,
  audio,
  metrics,
  touch,
}: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
  playerStore: PovPlayerStore;
  sessionRef: RefObject<PovSession | null>;
  canvas: HTMLCanvasElement | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  presenterRef: RefObject<PovPresenter | null>;
  unlockingForScreenRef: RefObject<boolean>;
  release: () => void;
  audio: Pick<PovAudio, "mute" | "reset" | "accept">;
  metrics: PovStreamMetrics | null;
  touch: boolean;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("instance");
  // The stream effect reads the translator through a ref so that switching
  // the language does not restart the session.
  const tRef = useAsRef(t);
  const actions = playerStore.actions;
  const playing = useSelector(playerStore, (state) => state.playing);
  const retry = useSelector(playerStore, (state) => state.retry);
  const displayFpsRef = useRef(60);
  const { mute: muteAudio, reset: resetAudio, accept: acceptAudio } = audio;

  useEffect(() => {
    if (!playing || !isOnline) return undefined;
    let disposed = false;
    const feedback = new PovStreamFeedbackTracker();
    let decoder: PovVideoDecoder | undefined;
    actions.connecting();
    resetAudio();
    const dimensions = () => {
      const current = canvasRef.current;
      const rect = current?.getBoundingClientRect();
      if (!rect) return null;
      const size = povRenderSize(
        rect.width,
        rect.height,
        current?.ownerDocument.defaultView?.devicePixelRatio ?? 1,
      );
      return size ? { ...size, maxFps: displayFpsRef.current } : null;
    };
    const failed = (reason: Error) => {
      if (disposed) return;
      if (
        reason instanceof ConnectError &&
        reason.code === Code.FailedPrecondition
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["bot-info", instanceId, botId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["bot-status", instanceId],
        });
      }
      // ConnectError.message adds a "[code]" prefix that users should not see.
      actions.setError(
        reason instanceof ConnectError ? reason.rawMessage : reason.message,
      );
      actions.disconnected();
      release();
      sessionRef.current?.stop();
      muteAudio();
      decoder?.close();
    };
    const presentationWindow = () =>
      canvasRef.current?.ownerDocument.defaultView ?? window;
    let frameWindow = window;
    const presenter = new PovPresenter(
      (frame, metadata) => {
        const target = canvasRef.current;
        if (!target || disposed) return;
        if (target.width !== frame.displayWidth)
          target.width = frame.displayWidth;
        if (target.height !== frame.displayHeight)
          target.height = frame.displayHeight;
        target
          .getContext("2d", { alpha: false, desynchronized: true })
          ?.drawImage(frame, 0, 0);
        metrics?.draw(metadata);
        const screenChanged = actions.framePresented(metadata.screenOpen);
        target.style.cursor = povCursor(metadata.cursorShape);
        const textInput = textInputRef.current;
        if (screenChanged && !metadata.screenOpen && textInput) {
          // Discard unfinished composition before returning to gameplay.
          textInput.value = "";
          textInput.blur();
        }
        if (!isCaptured(playerStore.get())) return;
        if (screenChanged) {
          const doc = target.ownerDocument;
          if (metadata.screenOpen && doc.pointerLockElement === target) {
            unlockingForScreenRef.current = true;
            doc.exitPointerLock();
          } else if (!metadata.screenOpen && !touch) {
            // Browsers may require another click to regain pointer lock.
            void lockPovPointer(target).catch(release);
          }
        }
        if (metadata.screenOpen && !touch)
          textInput?.focus({ preventScroll: true });
        // A reconnected stream starts released. Confirm control again.
        sessionRef.current?.capture(true);
      },
      (callback) => {
        frameWindow = presentationWindow();
        return frameWindow.requestAnimationFrame(callback);
      },
      (id) => {
        frameWindow.cancelAnimationFrame(id);
      },
      localStorage.getItem("soulfire.pov.presentation") === "paced",
    );
    presenterRef.current = presenter;
    try {
      decoder = new PovVideoDecoder(
        (frame, metadata) => {
          presenter.present(frame, metadata);
        },
        () => sessionRef.current?.requestKeyFrame(),
        failed,
      );
      if (metrics) {
        const activeDecoder = decoder;
        metrics.watchDecoder(() => activeDecoder.stats);
      }
      const transport = createTransport();
      if (!transport)
        throw new Error(tRef.current("instance:bots.pov.needsServer"));
      sessionRef.current = startPovSession(
        transport,
        povInputUrl(),
        instanceId,
        botId,
        dimensions,
        (frame) => {
          feedback.receive(frame);
          metrics?.receive(frame);
          acceptAudio(frame);
          decoder?.accept(frame);
        },
        failed,
        () => {
          feedback.reset();
          metrics?.reconnect();
          decoder?.reset();
          presenter.reset();
          resetAudio();
          actions.disconnected();
        },
        () => (decoder ? feedback.sample(decoder.stats) : undefined),
        (text) => void copyMinecraftText(text, presentationWindow()),
        (value) => {
          openMinecraftUrl(value, presentationWindow(), release);
        },
      );
    } catch (reason) {
      actions.setError(
        reason instanceof Error
          ? reason.message
          : tRef.current("instance:bots.pov.startError"),
      );
    }
    return () => {
      disposed = true;
      muteAudio();
      actions.disconnected();
      if (metrics) {
        metrics.watchDecoder(null);
        metrics.reconnect();
      }
      presenter.reset();
      presenterRef.current = null;
      decoder?.close();
      release();
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [
    queryClient,
    playing,
    isOnline,
    instanceId,
    botId,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a new retry value starts a fresh session
    retry,
    release,
    metrics,
    touch,
    actions,
    playerStore,
    muteAudio,
    resetAudio,
    acceptAudio,
    tRef,
    sessionRef,
    canvasRef,
    textInputRef,
    presenterRef,
    unlockingForScreenRef,
  ]);

  // Ask the server for the display refresh rate. It may change when the
  // window moves to another screen.
  useEffect(() => {
    const win = canvas?.ownerDocument.defaultView;
    if (!win) return undefined;
    let disposed = false;
    const sample = () => {
      if (canvas.ownerDocument.hidden) return;
      void povDisplayFps(win).then((fps) => {
        if (!disposed) displayFpsRef.current = fps;
      });
    };
    sample();
    const interval = win.setInterval(sample, 5000);
    return () => {
      disposed = true;
      win.clearInterval(interval);
    };
  }, [canvas]);
}
