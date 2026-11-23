import { useSelector } from "@tanstack/react-store";
import { use, useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TransportContext } from "@/components/providers/transport-context";
import { PovStreamOverlay } from "@/components/pov/pov-stream-overlay";
import {
  PovReconnectingBadge,
  PovStatusLine,
  PovStatusOverlay,
} from "@/components/pov/pov-status";
import { PovAudioControls, PovToolbar } from "@/components/pov/pov-toolbar";
import {
  PovTouchControls,
  PovTouchToolbar,
} from "@/components/pov/pov-touch-controls";
import { usePovAudio } from "@/components/pov/use-pov-audio";
import { usePovCapture } from "@/components/pov/use-pov-capture";
import { usePovGamepad } from "@/components/pov/use-pov-gamepad";
import { usePovInput } from "@/components/pov/use-pov-input";
import { usePovPopup } from "@/components/pov/use-pov-popup";
import { usePovStream } from "@/components/pov/use-pov-stream";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { titlebarClassName } from "@/components/window/titlebar-class-name";
import { WindowControls } from "@/components/window/window-titlebar";
import { desktop, isDesktopApp } from "@/lib/desktop";
import type { PovPresenter } from "@/lib/pov-presenter";
import type { PovSession } from "@/lib/pov-session";
import { PovStreamMetrics, povDebugEnabled } from "@/lib/pov-stream-metrics";
import { POV_TOUCH_CONTROLS_SOURCE } from "@/lib/pov-touch-input";
import { createPovPlayerStore, isCaptured } from "@/stores/pov-player-store";

/** What to show in place of the view while the bot is not in the world. */
export interface PovOfflineStatus {
  message: string;
  /** True while the bot is on its way, so the user should wait. */
  waiting: boolean;
  detail?: string | undefined;
}

export function BotPovPlayer(props: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
  offlineStatus?: PovOfflineStatus;
}) {
  return (
    <BotPovSession key={`${props.instanceId}:${props.botId}`} {...props} />
  );
}

function BotPovSession({
  instanceId,
  botId,
  isOnline,
  offlineStatus,
}: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
  offlineStatus?: PovOfflineStatus;
}) {
  const { t } = useTranslation("instance");
  // The demo has no server to stream from, so retrying cannot help.
  const demo = use(TransportContext) === null;
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [playerStore] = useState(createPovPlayerStore);
  const actions = playerStore.actions;
  const toasterId = useId();
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [metrics] = useState(() =>
    povDebugEnabled() ? new PovStreamMetrics() : null,
  );
  const guiOpen = useSelector(playerStore, (state) => state.screenOpen);
  const playing = useSelector(playerStore, (state) => state.playing);
  const capturePending = useSelector(
    playerStore,
    (state) => state.capture === "pending",
  );
  const captured = useSelector(playerStore, isCaptured);
  const connected = useSelector(playerStore, (state) => state.connected);
  const error = useSelector(playerStore, (state) => state.error);
  const captureError = useSelector(playerStore, (state) => state.captureError);
  const fullscreen = useSelector(playerStore, (state) => state.fullscreen);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const presenterRef = useRef<PovPresenter | null>(null);
  const sessionRef = useRef<PovSession | null>(null);
  // Set while the player exits pointer lock on purpose, so the lock change
  // does not count as the user releasing control.
  const unlockingForScreenRef = useRef(false);

  const audio = usePovAudio(sessionRef);
  const { release, capture, toggleFullscreen, heldMouseButtonsRef } =
    usePovCapture({
      playerStore,
      sessionRef,
      canvas,
      canvasRef,
      rootRef,
      textInputRef,
      touch,
      connected,
      toasterId,
    });
  usePovStream({
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
  });
  usePovInput({
    canvas,
    playerStore,
    sessionRef,
    rootRef,
    textInputRef,
    heldMouseButtonsRef,
    unlockingForScreenRef,
    release,
  });
  usePovGamepad({ canvas, captured, playerStore, sessionRef, release });
  const { popup, detach, attach } = usePovPopup({
    playerStore,
    release,
    toasterId,
  });

  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    presenterRef.current?.reset();
    canvasRef.current = node;
    setCanvas(node);
  }, []);

  const immersive = fullscreen || popup !== null;
  const audioControls = (
    <PovAudioControls
      audio={audio}
      available={isOnline && connected && playing}
      playing={playing}
    />
  );
  const player = (
    <div
      ref={rootRef}
      className={`relative flex min-h-0 flex-col bg-background ${immersive ? "h-screen" : "gap-2"}`}
    >
      {popup && isDesktopApp() && !fullscreen && (
        <header data-app-drag-region="" className={titlebarClassName}>
          <span className="col-start-2 self-center text-xs">
            {t("bots.pov.windowTitle")}
          </span>
          <div className="window-topbar-no-drag col-start-3 justify-self-end">
            <WindowControls windowApi={desktop.povWindow} />
          </div>
        </header>
      )}
      {!immersive && (
        <PovToolbar
          watching={playing && isOnline && !demo}
          canWatch={isOnline && !demo}
          captured={captured}
          canCapture={isOnline && connected && playing && !capturePending}
          audioControls={audioControls}
          onToggleWatch={() => {
            release();
            actions.setPlaying(!playing);
          }}
          onToggleCapture={captured ? release : () => void capture()}
          onFullscreen={() => void toggleFullscreen()}
          onDetach={detach}
        />
      )}
      {touch && captured && (
        <PovTouchToolbar
          screenOpen={guiOpen}
          keyboard={() => textInputRef.current?.focus()}
          closeMenu={() => sessionRef.current?.escape()}
          release={release}
        />
      )}
      <div
        className={`relative ${touch && captured && !immersive ? "min-h-60" : "min-h-0"} overflow-hidden bg-black ${immersive ? "" : "rounded-lg"} ${captured && !immersive ? "outline-2 outline-offset-2 outline-primary" : ""} ${immersive ? "flex-1" : "aspect-video"}`}
      >
        <textarea
          ref={textInputRef}
          aria-label={t("bots.pov.textInputLabel")}
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          className="pointer-events-none absolute size-px opacity-0"
          tabIndex={-1}
        />
        <canvas
          ref={attachCanvas}
          className="block size-full touch-none"
          aria-label={t("bots.pov.videoLabel")}
        />
        {metrics && <PovStreamOverlay metrics={metrics} />}
        {touch && captured && (
          <PovTouchControls
            send={(events) => {
              for (const event of events)
                sessionRef.current?.enqueue(event, POV_TOUCH_CONTROLS_SOURCE);
            }}
            screenOpen={guiOpen}
          />
        )}
        {captured ? (
          !connected && <PovReconnectingBadge />
        ) : (
          <PovStatusOverlay
            error={error}
            demo={demo}
            isOnline={isOnline}
            offlineStatus={offlineStatus}
            playing={playing}
            capturePending={capturePending}
            connected={connected}
            captureError={captureError}
            onReconnect={() => {
              actions.reconnect();
            }}
            onWatch={() => {
              actions.setPlaying(true);
            }}
            onCapture={() => void capture()}
          />
        )}
      </div>
      {immersive && !captured && (
        <div className="flex items-center gap-2 p-2">{audioControls}</div>
      )}
      {!immersive && (
        <PovStatusLine
          touch={touch}
          captured={captured}
          watching={playing && connected}
        />
      )}
      <Toaster
        id={toasterId}
        position="bottom-center"
        style={{ position: "absolute" }}
      />
    </div>
  );
  return popup ? (
    <>
      {createPortal(player, popup.document.body)}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            popup.focus();
          }}
        >
          {t("bots.pov.showWindow")}
        </Button>
        <Button variant="outline" onClick={attach}>
          {t("bots.pov.attachWindow")}
        </Button>
      </div>
    </>
  ) : (
    player
  );
}
