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
import { PovStreamOverlay } from "@/components/pov/pov-stream-overlay";
import { PovTouchControls } from "@/components/pov/pov-touch-controls";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { desktop, isDesktopApp, isMac } from "@/lib/desktop";
import { povCursor } from "@/lib/pov-cursor";
import { povDisplayFps } from "@/lib/pov-display";
import { PovGamepad } from "@/lib/pov-gamepad";
import {
  inputModifiers,
  isPovReleaseShortcut,
  isSystemShortcut,
  keyInput,
  mouseButton,
} from "@/lib/pov-input";
import { lockPovPointer } from "@/lib/pov-pointer-lock";
import { PovPresenter } from "@/lib/pov-presenter";
import { povRenderSize } from "@/lib/pov-render-size";
import { startPovSession } from "@/lib/pov-session";
import { PovStreamFeedbackTracker } from "@/lib/pov-stream-feedback";
import { PovStreamMetrics, povDebugEnabled } from "@/lib/pov-stream-metrics";
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
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  const [guiOpen, setGuiOpen] = useState(false);
  const releaseShortcut = isMac ? "Cmd+Shift+G" : "Ctrl+Shift+G";
  const nativeCaptureTarget = useRef<"pov" | undefined>(undefined);
  const [metrics] = useState(() =>
    povDebugEnabled() ? new PovStreamMetrics() : null,
  );
  const [playing, setPlaying] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [capturePending, setCapturePending] = useState(false);
  const captureAttempt = useRef(0);
  const captureInFlight = useRef(false);
  const [captured, setCaptured] = useState(false);
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [popup, setPopup] = useState<Window | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const displayFpsRef = useRef(60);
  const presenterRef = useRef<PovPresenter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const unlockingForScreen = useRef(false);
  const session = useRef<ReturnType<typeof startPovSession> | null>(null);
  const capturedRef = useRef(false);
  const screenOpen = useRef(false);

  const release = useCallback(() => {
    captureAttempt.current++;
    captureInFlight.current = false;
    setCapturePending(false);
    toast.dismiss(captureToastId);
    capturedRef.current = false;
    setCaptured(false);
    session.current?.capture(false);
    if (isDesktopApp())
      void desktop.pov
        .setCaptured(false, nativeCaptureTarget.current)
        .catch(console.error);
    const doc = canvasRef.current?.ownerDocument;
    if (doc?.pointerLockElement) doc.exitPointerLock();
    if (doc?.fullscreenElement === rootRef.current && doc?.fullscreenElement) {
      void doc.exitFullscreen().catch(() => {});
    }
    const navigator = doc?.defaultView?.navigator as
      | KeyboardCapture
      | undefined;
    navigator?.keyboard?.unlock();
  }, [captureToastId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reconnect explicitly replaces the stream even when the bot is unchanged.
  useEffect(() => {
    if (!playing || !isOnline) return;
    let disposed = false;
    const feedback = new PovStreamFeedbackTracker();
    let decoder: PovVideoDecoder | undefined;
    setError(null);
    connectedRef.current = false;
    setConnected(false);
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
      setError(reason.message);
      connectedRef.current = false;
      setConnected(false);
      release();
      session.current?.stop();
      decoder?.close();
    };
    let presentationWindow = window;
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
        const screenChanged = screenOpen.current !== metadata.screenOpen;
        screenOpen.current = metadata.screenOpen;
        if (screenChanged) setGuiOpen(metadata.screenOpen);
        target.style.cursor = povCursor(metadata.cursorShape);
        if (capturedRef.current && screenChanged) {
          const doc = target.ownerDocument;
          if (metadata.screenOpen && doc.pointerLockElement === target) {
            unlockingForScreen.current = true;
            doc.exitPointerLock();
          } else if (!metadata.screenOpen && !touch) {
            // Browsers may require another click to regain pointer lock.
            void lockPovPointer(target).catch(release);
          }
        }
        if (metadata.screenOpen && capturedRef.current && !touch)
          textInputRef.current?.focus({ preventScroll: true });
        if (capturedRef.current) session.current?.capture(true);
        connectedRef.current = true;
        setConnected(true);
      },
      (callback) => {
        presentationWindow =
          canvasRef.current?.ownerDocument.defaultView ?? window;
        return presentationWindow.requestAnimationFrame(callback);
      },
      (id) => presentationWindow.cancelAnimationFrame(id),
      localStorage.getItem("soulfire.pov.presentation") === "paced",
    );
    presenterRef.current = presenter;
    try {
      decoder = new PovVideoDecoder(
        (frame, metadata) => presenter.present(frame, metadata),
        () => session.current?.requestKeyFrame(),
        failed,
      );
      if (metrics) {
        const activeDecoder = decoder;
        metrics.decoder = () => activeDecoder.stats;
      }
      session.current = startPovSession(
        instanceId,
        botId,
        dimensions,
        (frame) => {
          feedback.receive(frame);
          metrics?.receive(frame);
          decoder?.accept(frame);
        },
        failed,
        () => {
          feedback.reset();
          metrics?.reconnect();
          decoder?.reset();
          presenter.reset();
          connectedRef.current = false;
          setConnected(false);
        },
        () => (decoder ? feedback.sample(decoder.stats) : undefined),
        undefined,
        (text) => {
          void (
            isDesktopApp()
              ? desktop.clipboard.writeText(text)
              : (
                  canvasRef.current?.ownerDocument.defaultView?.navigator ??
                  navigator
                ).clipboard.writeText(text)
          ).catch(() =>
            toast.error("Allow clipboard access to copy text from Minecraft."),
          );
        },
        (value) => {
          let url: URL;
          try {
            url = new URL(value);
          } catch {
            return;
          }
          if (url.protocol !== "https:" && url.protocol !== "http:") return;
          const win = canvasRef.current?.ownerDocument.defaultView ?? window;
          release();
          if (isDesktopApp()) {
            void desktop.shell
              .openExternal(url.href)
              .catch(() => toast.error("Could not open the link."));
          } else {
            const opened = win.open("about:blank", "_blank");
            if (opened) {
              opened.opener = null;
              opened.location.href = url.href;
              return;
            }
            toast.info("Your browser blocked the new tab.", {
              action: {
                label: "Open link",
                onClick: () =>
                  win.open(url.href, "_blank", "noopener,noreferrer"),
              },
            });
          }
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to start POV.",
      );
    }
    return () => {
      disposed = true;
      if (metrics) {
        metrics.decoder = null;
        metrics.reconnect();
      }
      presenter.reset();
      presenterRef.current = null;
      decoder?.close();
      release();
      session.current?.stop();
      session.current = null;
    };
  }, [playing, isOnline, instanceId, botId, retry, release, metrics, touch]);

  useEffect(() => {
    const win = canvas?.ownerDocument.defaultView;
    if (!win) return;
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
        escapeForwarded = false;
        if (
          (!capturedRef.current && !captureInFlight.current) ||
          screenOpen.current
        ) {
          unlockingForScreen.current = true;
          doc.exitPointerLock();
        }
        return;
      }
      if (unlockingForScreen.current) {
        escapeForwarded = false;
        unlockingForScreen.current = false;
        return;
      }
      if (capturedRef.current) {
        // Chromium may consume Escape before dispatching a keyboard event.
        if (doc.hasFocus() && !escapeForwarded) session.current?.escape();
        escapeForwarded = false;
        release();
      }
    };
    let disposed = false;
    let unlistenReleased: (() => void) | undefined;
    if (isDesktopApp())
      void desktop.pov
        .onReleased((target) => {
          if ((target === "pov") === (doc !== document)) release();
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlistenReleased = unlisten;
        })
        .catch(console.error);
    let unlistenEscape: (() => void) | undefined;
    if (isDesktopApp())
      void desktop.pov
        .onEscape((event) => {
          if (
            !capturedRef.current ||
            (event.target === "pov") !== (doc !== document)
          )
            return;
          enqueue({
            kind: PovInputEvent_Kind.KEY,
            code: 256,
            action: event.action,
            modifiers: event.modifiers,
          });
        })
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlistenEscape = unlisten;
        })
        .catch(console.error);
    const visibility = () => {
      if (doc.hidden) release();
    };
    let escapeForwarded = false;
    const key = (event: KeyboardEvent) => {
      if (!capturedRef.current) return;
      if (isPovReleaseShortcut(event, isMac)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "keydown") release();
        return;
      }
      if (event.isComposing || event.code === "Process") return;
      const typing = event.target === textInputRef.current;
      if (typing && (event.ctrlKey || event.metaKey) && event.code === "KeyV")
        return;
      const copying =
        typing &&
        (event.ctrlKey || event.metaKey) &&
        (event.code === "KeyC" || event.code === "KeyX");
      if (isSystemShortcut(event) && !copying) return;
      const pressed = event.type === "keydown";
      const input = keyInput(event, pressed);
      if (!input) return;
      if (
        !(
          typing &&
          !event.ctrlKey &&
          !event.metaKey &&
          [...event.key].length === 1
        )
      )
        event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        if (pressed && !event.repeat) {
          escapeForwarded = true;
          session.current?.escape();
        }
        return;
      }
      if (copying) input.modifiers = 2;
      session.current?.enqueue(input);
      if (copying && pressed) session.current?.copy();
      if (
        pressed &&
        !typing &&
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
    const textInput = textInputRef.current;
    const text = (event: Event) => {
      if (
        !capturedRef.current ||
        !textInput ||
        (event as InputEvent).isComposing
      )
        return;
      for (const character of textInput.value)
        enqueue({
          kind: PovInputEvent_Kind.CHARACTER,
          code: character.codePointAt(0),
        });
      textInput.value = "";
    };
    const paste = (event: ClipboardEvent) => {
      if (!capturedRef.current || !screenOpen.current) return;
      event.preventDefault();
      session.current?.paste(event.clipboardData?.getData("text/plain") ?? "");
    };
    textInput?.addEventListener("input", text);
    textInput?.addEventListener("compositionend", text);
    textInput?.addEventListener("paste", paste);
    const gamepad = new PovGamepad();
    let padFrame = 0;
    let padTime = win.performance.now();
    const pollPad = (now: number) => {
      const seconds = Math.min(0.05, (now - padTime) / 1000);
      padTime = now;
      if (capturedRef.current && connectedRef.current) {
        const pad =
          Array.from(win.navigator.getGamepads?.() ?? []).find(
            (pad) => pad?.connected && pad.mapping === "standard",
          ) ?? null;
        if (pad?.buttons[8]?.pressed && pad.buttons[9]?.pressed) {
          release();
          gamepad.reset();
        } else
          for (const event of gamepad.sample(pad, seconds, screenOpen.current))
            session.current?.enqueue(event, "gamepad");
      } else gamepad.reset();
      padFrame = win.requestAnimationFrame(pollPad);
    };
    padFrame = win.requestAnimationFrame(pollPad);
    const touches = new Map<number, { x: number; y: number }>();
    const touchStart = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !capturedRef.current) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (screenOpen.current) {
        moveInScreen(event);
        session.current?.enqueue(
          create(PovInputEventSchema, {
            kind: PovInputEvent_Kind.BUTTON,
            code: 0,
            action: 1,
          }),
          "touch",
        );
      }
    };
    const touchMove = (event: PointerEvent) => {
      const previous = touches.get(event.pointerId);
      if (!previous || !capturedRef.current) return;
      event.preventDefault();
      if (screenOpen.current) moveInScreen(event);
      else
        enqueue({
          kind: PovInputEvent_Kind.MOVE,
          x: event.clientX - previous.x,
          y: event.clientY - previous.y,
          relative: true,
        });
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const touchEnd = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return;
      session.current?.enqueue(
        create(PovInputEventSchema, {
          kind: PovInputEvent_Kind.BUTTON,
          code: 0,
          action: 0,
        }),
        "touch",
      );
    };
    canvas.addEventListener("pointerdown", touchStart);
    canvas.addEventListener("pointermove", touchMove);
    canvas.addEventListener("pointerup", touchEnd);
    canvas.addEventListener("pointercancel", touchEnd);
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
    const fullscreenChange = () => {
      const active = doc.fullscreenElement === rootRef.current;
      setFullscreen(active);
      // Keyboard Lock is only available after fullscreen has been entered.
      if (active && capturedRef.current) {
        void (win.navigator as KeyboardCapture).keyboard
          ?.lock(["KeyW", "KeyA", "KeyS", "KeyD", "Tab", "Space", "Escape"])
          .catch(() => {});
      }
    };
    doc.addEventListener("pointerlockchange", locked);
    doc.addEventListener("fullscreenchange", fullscreenChange);
    doc.addEventListener("visibilitychange", visibility);
    doc.addEventListener("keydown", key, true);
    doc.addEventListener("keyup", key, true);

    doc.addEventListener("mousemove", move);
    doc.addEventListener("mousedown", button);
    doc.addEventListener("mouseup", button);
    doc.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    win.addEventListener("blur", release);
    win.addEventListener("pagehide", release);
    return () => {
      disposed = true;
      win.cancelAnimationFrame(padFrame);
      canvas.removeEventListener("pointerdown", touchStart);
      canvas.removeEventListener("pointermove", touchMove);
      canvas.removeEventListener("pointerup", touchEnd);
      canvas.removeEventListener("pointercancel", touchEnd);
      textInput?.removeEventListener("input", text);
      textInput?.removeEventListener("compositionend", text);
      textInput?.removeEventListener("paste", paste);
      unlistenEscape?.();
      unlistenReleased?.();
      release();
      doc.removeEventListener("pointerlockchange", locked);
      doc.removeEventListener("fullscreenchange", fullscreenChange);
      doc.removeEventListener("visibilitychange", visibility);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("keyup", key, true);

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
    presenterRef.current?.reset();
    canvasRef.current = node;
    setCanvas(node);
  }, []);

  const capture = useCallback(async () => {
    if (!canvas || !connected || !canvas.ownerDocument.hasFocus()) return;
    const attempt = ++captureAttempt.current;
    captureInFlight.current = true;
    setCapturePending(true);
    setCaptureError(null);
    try {
      nativeCaptureTarget.current =
        canvas.ownerDocument === document ? undefined : "pov";
      if (isDesktopApp())
        await desktop.pov.setCaptured(true, nativeCaptureTarget.current);
      if (!screenOpen.current) {
        if (!touch) await lockPovPointer(canvas);
      } else if (!touch) textInputRef.current?.focus({ preventScroll: true });
      if (attempt !== captureAttempt.current || canvasRef.current !== canvas)
        return;
      capturedRef.current = true;
      setCaptured(true);
      session.current?.capture(true);
      if (attempt !== captureAttempt.current) return;
      toast.info(
        `Press ${releaseShortcut} to release your keyboard and mouse.`,
        {
          id: captureToastId,
          toasterId: captureToastId,
          duration: 4000,
        },
      );
      const navigator = canvas.ownerDocument.defaultView?.navigator as
        | KeyboardCapture
        | undefined;
      // Where supported, allow Minecraft to receive Escape in fullscreen.
      void navigator?.keyboard
        ?.lock(["KeyW", "KeyA", "KeyS", "KeyD", "Tab", "Space", "Escape"])
        .catch(() => {});
    } catch (error) {
      release();
      setCaptureError(
        error instanceof Error
          ? `${error.message} Click to play and allow mouse/keyboard capture.`
          : "Click to play and allow mouse/keyboard capture.",
      );
    } finally {
      if (attempt === captureAttempt.current) {
        captureInFlight.current = false;
        setCapturePending(false);
      }
    }
  }, [canvas, connected, captureToastId, releaseShortcut, release, touch]);

  useEffect(() => {
    if (!autoStart || !connected || !canvas) return;
    setAutoStart(false);
    void capture();
  }, [autoStart, connected, canvas, capture]);

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
              if (!playing) setAutoStart(true);
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
            disabled={!isOnline || !connected || !playing || capturePending}
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
        <textarea
          ref={textInputRef}
          aria-label="Minecraft text input"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          className="pointer-events-none absolute size-px opacity-0"
          tabIndex={-1}
        />
        <canvas
          ref={attachCanvas}
          className="block size-full touch-none"
          aria-label="Live Minecraft POV"
        />
        {metrics && <PovStreamOverlay metrics={metrics} />}
        {touch && captured && (
          <PovTouchControls
            keyEvent={(code, pressed) =>
              session.current?.enqueue(
                create(PovInputEventSchema, {
                  kind: PovInputEvent_Kind.KEY,
                  code,
                  action: pressed ? 1 : 0,
                }),
                "touch",
              )
            }
            buttonEvent={(code, pressed) =>
              session.current?.enqueue(
                create(PovInputEventSchema, {
                  kind: PovInputEvent_Kind.BUTTON,
                  code,
                  action: pressed ? 1 : 0,
                }),
                "touch",
              )
            }
            release={release}
            screenOpen={guiOpen}
            keyboard={() => textInputRef.current?.focus()}
          />
        )}
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
              <Button
                onClick={() => {
                  setAutoStart(true);
                  setPlaying(true);
                }}
              >
                <PlayIcon data-icon="inline-start" />
                Watch bot
              </Button>
            ) : !connected || autoStart || capturePending ? (
              <p>Connecting…</p>
            ) : (
              <button
                type="button"
                onClick={capture}
                className="absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]"
              >
                <span className={buttonVariants()}>
                  <Gamepad2Icon data-icon="inline-start" />
                  Click to play
                </span>
                {captureError && (
                  <span className="absolute inset-x-4 bottom-4 text-center text-sm text-muted-foreground">
                    {captureError}
                  </span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      {!immersive && (
        <p className="text-muted-foreground text-xs">
          {captured
            ? `Controlling Minecraft. Press ${releaseShortcut} to release.`
            : `Play captures your keyboard and mouse. ${releaseShortcut} releases control.`}
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
