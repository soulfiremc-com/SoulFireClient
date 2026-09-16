import { create } from "@bufbuild/protobuf";
import {
  ExpandIcon,
  ExternalLinkIcon,
  Gamepad2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  titlebarClassName,
  WindowControls,
} from "@/components/window/window-titlebar";
import {
  PovInputEvent_Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";
import { WINDOW_TITLEBAR_HEIGHT } from "@/hooks/use-window-titlebar";
import { desktop, isDesktopApp } from "@/lib/desktop";
import { povCursor } from "@/lib/pov-cursor";
import {
  inputModifiers,
  isSystemShortcut,
  keyInput,
  mouseButton,
} from "@/lib/pov-input";
import { povRenderSize } from "@/lib/pov-render-size";
import { startPovSession } from "@/lib/pov-session";
import { PovVideoDecoder } from "@/lib/pov-video-decoder";

type KeyboardCapture = Navigator & {
  keyboard?: { lock(keys?: string[]): Promise<void>; unlock(): void };
};

export function BotPovPlayer({
  instanceId,
  botId,
  isOnline,
}: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
}) {
  const captureToastId = useId();
  const [playing, setPlaying] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [popup, setPopup] = useState<Window | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const unlockingForScreen = useRef(false);
  const session = useRef<ReturnType<typeof startPovSession> | null>(null);
  const capturedRef = useRef(false);
  const screenOpen = useRef(false);

  const release = useCallback(() => {
    toast.dismiss(captureToastId);
    capturedRef.current = false;
    setCaptured(false);
    session.current?.capture(false);
    const doc = canvasRef.current?.ownerDocument;
    if (doc?.pointerLockElement) doc.exitPointerLock();
    const navigator = doc?.defaultView?.navigator as
      | KeyboardCapture
      | undefined;
    navigator?.keyboard?.unlock();
  }, [captureToastId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reconnect explicitly replaces the stream even when the bot is unchanged.
  useEffect(() => {
    if (!playing || !isOnline) return;
    let disposed = false;
    let decoder: PovVideoDecoder | undefined;
    setError(null);
    setConnected(false);
    const dimensions = () => {
      const current = canvasRef.current;
      const rect = current?.getBoundingClientRect();
      return rect
        ? povRenderSize(
            rect.width,
            rect.height,
            current?.ownerDocument.defaultView?.devicePixelRatio ?? 1,
          )
        : null;
    };
    const failed = (reason: Error) => {
      if (disposed) return;
      setError(reason.message);
      setConnected(false);
      release();
      session.current?.stop();
      decoder?.close();
    };
    try {
      decoder = new PovVideoDecoder(
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
          const screenChanged = screenOpen.current !== metadata.screenOpen;
          screenOpen.current = metadata.screenOpen;
          target.style.cursor = povCursor(metadata.cursorShape);
          if (capturedRef.current && screenChanged) {
            const doc = target.ownerDocument;
            if (metadata.screenOpen && doc.pointerLockElement === target) {
              unlockingForScreen.current = true;
              doc.exitPointerLock();
            } else if (!metadata.screenOpen) {
              // Browsers may require another click to regain pointer lock.
              void target.requestPointerLock().catch(release);
            }
          }
          setConnected(true);
        },
        () => session.current?.requestKeyFrame(),
        failed,
      );
      session.current = startPovSession(
        instanceId,
        botId,
        dimensions,
        (frame) => decoder?.accept(frame),
        failed,
        () => {
          decoder?.reset();
          setConnected(false);
          release();
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to start POV.",
      );
    }
    return () => {
      disposed = true;
      decoder?.close();
      release();
      session.current?.stop();
      session.current = null;
    };
  }, [playing, isOnline, instanceId, botId, retry, release]);

  useEffect(() => {
    if (!canvas) return;
    const doc = canvas.ownerDocument;
    const win = doc.defaultView;
    if (!win) return;
    const enqueue = (
      values: Parameters<typeof create<typeof PovInputEventSchema>>[1],
    ) => {
      session.current?.enqueue(create(PovInputEventSchema, values));
    };
    const locked = () => {
      if (doc.pointerLockElement === canvas) {
        if (!capturedRef.current || screenOpen.current) {
          unlockingForScreen.current = true;
          doc.exitPointerLock();
        }
        return;
      }
      if (unlockingForScreen.current) {
        unlockingForScreen.current = false;
        return;
      }
      if (capturedRef.current) {
        // Chromium may consume Escape before dispatching a keyboard event.
        if (doc.hasFocus()) session.current?.escape();
        release();
      }
    };
    const visibility = () => {
      if (doc.hidden) release();
    };
    const key = (event: KeyboardEvent) => {
      if (!capturedRef.current || isSystemShortcut(event)) return;
      const pressed = event.type === "keydown";
      const input = keyInput(event, pressed);
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        if (pressed) session.current?.escape();
        release();
        return;
      }
      session.current?.enqueue(input);
      if (
        pressed &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        [...event.key].length === 1
      ) {
        enqueue({
          kind: PovInputEvent_Kind.CHARACTER,
          code: event.key.codePointAt(0),
        });
      }
    };
    const composition = (event: CompositionEvent) => {
      if (!capturedRef.current) return;
      for (const character of event.data)
        enqueue({
          kind: PovInputEvent_Kind.CHARACTER,
          code: character.codePointAt(0),
        });
    };
    const heldButtons = new Set<number>();
    const moveInScreen = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      enqueue({
        kind: PovInputEvent_Kind.MOVE,
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      });
    };
    const move = (event: MouseEvent) => {
      if (!capturedRef.current) return;
      if (screenOpen.current) {
        if (event.target === canvas || heldButtons.size > 0)
          moveInScreen(event);
      } else if (doc.pointerLockElement === canvas) {
        enqueue({
          kind: PovInputEvent_Kind.MOVE,
          x: event.movementX,
          y: event.movementY,
          relative: true,
        });
      }
    };
    const button = (event: MouseEvent) => {
      if (!capturedRef.current) return;
      const pressed = event.type === "mousedown";
      if (screenOpen.current) {
        if (event.target !== canvas && !heldButtons.has(event.button)) {
          if (pressed) release();
          return;
        }
        moveInScreen(event);
      } else if (doc.pointerLockElement !== canvas) return;
      event.preventDefault();
      if (pressed) heldButtons.add(event.button);
      else heldButtons.delete(event.button);
      enqueue({
        kind: PovInputEvent_Kind.BUTTON,
        code: mouseButton(event.button),
        action: pressed ? 1 : 0,
        modifiers: inputModifiers(event),
      });
    };
    const wheel = (event: WheelEvent) => {
      if (!capturedRef.current) return;
      event.preventDefault();
      enqueue({
        kind: PovInputEvent_Kind.SCROLL,
        x: -Math.sign(event.deltaX),
        y: -Math.sign(event.deltaY),
      });
    };
    const context = (event: Event) => {
      if (capturedRef.current && event.target === canvas)
        event.preventDefault();
    };
    const fullscreenChange = () =>
      setFullscreen(doc.fullscreenElement === rootRef.current);
    doc.addEventListener("pointerlockchange", locked);
    doc.addEventListener("fullscreenchange", fullscreenChange);
    doc.addEventListener("visibilitychange", visibility);
    doc.addEventListener("keydown", key, true);
    doc.addEventListener("keyup", key, true);
    doc.addEventListener("compositionend", composition);
    doc.addEventListener("mousemove", move);
    doc.addEventListener("mousedown", button);
    doc.addEventListener("mouseup", button);
    doc.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    win.addEventListener("blur", release);
    win.addEventListener("pagehide", release);
    return () => {
      release();
      doc.removeEventListener("pointerlockchange", locked);
      doc.removeEventListener("fullscreenchange", fullscreenChange);
      doc.removeEventListener("visibilitychange", visibility);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("keyup", key, true);
      doc.removeEventListener("compositionend", composition);
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("mousedown", button);
      doc.removeEventListener("mouseup", button);
      doc.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
      win.removeEventListener("blur", release);
      win.removeEventListener("pagehide", release);
    };
  }, [canvas, release]);

  useEffect(() => {
    if (!popup) return;
    const syncTheme = () => {
      const source = document.documentElement;
      const target = popup.document.documentElement;
      for (const attribute of ["class", "style", "lang", "dir"]) {
        const value = source.getAttribute(attribute);
        if (value === null) target.removeAttribute(attribute);
        else target.setAttribute(attribute, value);
      }
      target.style.setProperty("--titlebar-height", WINDOW_TITLEBAR_HEIGHT);
    };
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "lang", "dir"],
    });
    const closed = () => {
      release();
      setPopup(null);
      setFullscreen(false);
    };
    popup.addEventListener("pagehide", closed);
    return () => {
      themeObserver.disconnect();
      popup.removeEventListener("pagehide", closed);
      popup.close();
    };
  }, [popup, release]);

  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvas(node);
  }, []);

  async function capture() {
    if (!canvas || !connected) return;
    try {
      if (!screenOpen.current) await canvas.requestPointerLock();
      capturedRef.current = true;
      setCaptured(true);
      session.current?.capture(true);
      toast.info("Press Esc to release your keyboard and mouse.", {
        id: captureToastId,
        toasterId: captureToastId,
        duration: 4000,
      });
      const navigator = canvas.ownerDocument.defaultView?.navigator as
        | KeyboardCapture
        | undefined;
      // Escape stays reserved for leaving control. OS-level shortcuts remain browser-managed.
      void navigator?.keyboard
        ?.lock(["KeyW", "KeyA", "KeyS", "KeyD", "Tab", "Space"])
        .catch(() => {});
    } catch {
      setError("Mouse capture was denied. Click Play to try again.");
    }
  }

  function detach() {
    release();
    const child = window.open(
      "about:blank",
      "soulfire-pov",
      "popup,width=1280,height=800",
    );
    if (!child) {
      setError("Allow popups to detach the POV window.");
      return;
    }
    child.document.title = "SoulFire POV";
    child.document.documentElement.className =
      document.documentElement.className;
    for (const style of document.querySelectorAll(
      'link[rel="stylesheet"], style',
    ))
      child.document.head.append(style.cloneNode(true));
    child.document.body.style.margin = "0";
    child.document.documentElement.style.setProperty(
      "--titlebar-height",
      WINDOW_TITLEBAR_HEIGHT,
    );
    setPopup(child);
  }

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (root.ownerDocument.fullscreenElement)
        await root.ownerDocument.exitFullscreen();
      else {
        if (connected) void capture();
        await root.requestFullscreen();
      }
    } catch {
      setError("Fullscreen is unavailable in this window.");
    }
  }

  const immersive = fullscreen || popup !== null;
  const player = (
    <div
      ref={rootRef}
      className={`bg-background relative flex min-h-0 flex-col ${immersive ? "h-screen" : "gap-2"}`}
    >
      {popup && isDesktopApp() && !fullscreen && (
        <header data-app-drag-region="" className={titlebarClassName}>
          <span className="col-start-2 self-center text-xs">SoulFire POV</span>
          <div className="window-topbar-no-drag col-start-3 justify-self-end">
            <WindowControls windowApi={desktop.povWindow} />
          </div>
        </header>
      )}
      {!immersive && (
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-medium">Bot POV</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={!isOnline}
            onClick={() => {
              release();
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <PauseIcon data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {playing ? "Stop" : "Watch"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!isOnline || !connected || !playing}
            onClick={capture}
          >
            <Gamepad2Icon data-icon="inline-start" />
            Play
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
          >
            <ExpandIcon />
          </Button>
          <Button size="sm" variant="outline" onClick={detach}>
            <ExternalLinkIcon data-icon="inline-start" />
            Detach
          </Button>
        </div>
      )}
      <div
        className={`relative min-h-0 overflow-hidden bg-black ${immersive ? "" : "rounded-lg"} ${popup || fullscreen ? "flex-1" : "aspect-video"}`}
      >
        <canvas
          ref={attachCanvas}
          className="block size-full"
          aria-label="Live Minecraft POV"
        />
        {!captured && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
            {error ? (
              <div className="flex max-w-md flex-col items-center gap-3 p-4 text-center">
                <p role="alert">{error}</p>
                <Button
                  onClick={() => {
                    setError(null);
                    setRetry(retry + 1);
                  }}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Reconnect
                </Button>
              </div>
            ) : !isOnline ? (
              <p>Bot is offline</p>
            ) : !playing ? (
              <Button onClick={() => setPlaying(true)}>
                <PlayIcon data-icon="inline-start" />
                Watch bot
              </Button>
            ) : !connected ? (
              <p>Connecting…</p>
            ) : (
              <Button onClick={capture}>
                <Gamepad2Icon data-icon="inline-start" />
                Click to play
              </Button>
            )}
          </div>
        )}
      </div>
      {!immersive && (
        <p className="text-muted-foreground text-xs">
          {captured
            ? "Controlling Minecraft. Press Esc to release."
            : "Play captures your keyboard and mouse. Esc releases control."}
        </p>
      )}
      <Toaster
        id={captureToastId}
        position="bottom-center"
        style={{ position: "absolute" }}
      />
    </div>
  );
  return popup ? (
    <>
      {createPortal(player, popup.document.body)}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => popup.focus()}>
          Show POV window
        </Button>
        <Button variant="outline" onClick={() => setPopup(null)}>
          Attach POV window
        </Button>
      </div>
    </>
  ) : (
    player
  );
}
