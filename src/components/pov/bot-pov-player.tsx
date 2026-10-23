import { create } from "@bufbuild/protobuf";
import { useSelector } from "@tanstack/react-store";
import {
  ExpandIcon,
  ExternalLinkIcon,
  Gamepad2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { PovStreamOverlay } from "@/components/pov/pov-stream-overlay";
import {
  PovTouchControls,
  PovTouchToolbar,
} from "@/components/pov/pov-touch-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
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
import {
  copyMinecraftText,
  openMinecraftUrl,
} from "@/lib/minecraft-client-actions";
import { desktop, isDesktopApp, isMac } from "@/lib/desktop";
import { PovAudioPlayer } from "@/lib/pov-audio-player";
import { povCursor } from "@/lib/pov-cursor";
import { povDisplayFps } from "@/lib/pov-display";
import { PovGamepad } from "@/lib/pov-gamepad";
import {
  inputModifiers,
  isPovReleaseShortcut,
  isTextEditingShortcut,
  isTextInputKey,
  keyInput,
  mouseButton,
  scrollInput,
  textShortcutKey,
} from "@/lib/pov-input";
import { textEditEvents, textInputEvents } from "@/lib/pov-text-input";
import { lockPovPointer } from "@/lib/pov-pointer-lock";
import { PovPresenter } from "@/lib/pov-presenter";
import { povRenderSize } from "@/lib/pov-render-size";
import { startPovSession } from "@/lib/pov-session";
import { PovStreamFeedbackTracker } from "@/lib/pov-stream-feedback";
import { PovStreamMetrics, povDebugEnabled } from "@/lib/pov-stream-metrics";
import { PovVideoDecoder } from "@/lib/pov-video-decoder";
import { createPovPlayerStore } from "@/stores/pov-player-store";

type KeyboardCapture = Navigator & {
  keyboard?: { lock(keys?: string[]): Promise<void>; unlock(): void };
};

export function BotPovPlayer(props: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
}) {
  return (
    <BotPovSession key={`${props.instanceId}:${props.botId}`} {...props} />
  );
}

function BotPovSession({
  instanceId,
  botId,
  isOnline,
}: {
  instanceId: string;
  botId: string;
  isOnline: boolean;
}) {
  const [playerStore] = useState(createPovPlayerStore);
  const actions = playerStore.actions;
  const captureToastId = useId();
  const [touch] = useState(() => matchMedia("(pointer: coarse)").matches);
  const guiOpen = useSelector(playerStore, (state) => state.screenOpen);
  const releaseShortcut = isMac ? "Cmd+Shift+G" : "Ctrl+Shift+G";
  const nativeCaptureTarget = useRef<"pov" | undefined>(undefined);
  const [metrics] = useState(() =>
    povDebugEnabled() ? new PovStreamMetrics() : null,
  );
  const playing = useSelector(playerStore, (state) => state.playing);
  const capturePending = useSelector(
    playerStore,
    (state) => state.capture === "pending",
  );
  const captured = useSelector(
    playerStore,
    (state) => state.capture === "captured",
  );
  const connected = useSelector(playerStore, (state) => state.connected);
  const error = useSelector(playerStore, (state) => state.error);
  const retry = useSelector(playerStore, (state) => state.retry);
  const [popup, setPopup] = useState<Window | null>(null);
  const fullscreen = useSelector(playerStore, (state) => state.fullscreen);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const captureError = useSelector(playerStore, (state) => state.captureError);
  const displayFpsRef = useRef(60);
  const presenterRef = useRef<PovPresenter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const unlockingForScreen = useRef(false);
  const heldMouseButtons = useRef(new Set<number>());
  const session = useRef<ReturnType<typeof startPovSession> | null>(null);
  const audioRef = useRef<PovAudioPlayer | null>(null);
  const audioGeneration = useRef(0);
  const audioStartingAbort = useRef<AbortController | null>(null);
  const volumeLabelId = useId();
  const audioSupportedRef = useRef<boolean | null>(null);
  const [audioSupported, setAudioSupported] = useState<boolean | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStarting, setAudioStarting] = useState(false);
  const [volume, setVolume] = useState(80);
  const muteAudio = useCallback(() => {
    audioGeneration.current++;
    audioStartingAbort.current?.abort();
    audioStartingAbort.current = null;
    audioRef.current?.close();
    audioRef.current = null;
    setAudioEnabled(false);
    setAudioStarting(false);
    session.current?.audio(false);
  }, []);

  async function toggleAudio() {
    if (audioRef.current || audioStarting) {
      muteAudio();
      return;
    }
    const generation = ++audioGeneration.current;
    setAudioStarting(true);
    const abort = new AbortController();
    audioStartingAbort.current = abort;
    try {
      const audio = await PovAudioPlayer.create(
        volume / 100,
        (reason) => {
          if (generation !== audioGeneration.current) return;
          muteAudio();
          toast.error(reason.message);
        },
        abort.signal,
      );
      if (generation !== audioGeneration.current || !session.current) {
        audio.close();
        return;
      }
      audioRef.current = audio;
      setAudioEnabled(true);
      session.current.audio(true);
    } catch (reason) {
      if (generation === audioGeneration.current)
        toast.error(
          reason instanceof Error ? reason.message : "Unable to start audio.",
        );
    } finally {
      if (generation === audioGeneration.current) {
        audioStartingAbort.current = null;
        setAudioStarting(false);
      }
    }
  }

  const release = useCallback(() => {
    heldMouseButtons.current.clear();
    actions.releaseCapture();
    toast.dismiss(captureToastId);
    session.current?.capture(false);
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
    if (doc?.fullscreenElement === rootRef.current && doc?.fullscreenElement) {
      void doc.exitFullscreen().catch(() => {});
    }
    const navigator = doc?.defaultView?.navigator as
      | KeyboardCapture
      | undefined;
    navigator?.keyboard?.unlock();
  }, [captureToastId, actions]);

  useEffect(() => {
    if (!playing || !isOnline) return;
    let disposed = false;
    const feedback = new PovStreamFeedbackTracker();
    let decoder: PovVideoDecoder | undefined;
    actions.connecting();
    audioSupportedRef.current = null;
    setAudioSupported(null);
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
      actions.setError(reason.message);
      actions.disconnected();
      release();
      session.current?.stop();
      muteAudio();
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
        const screenChanged = actions.framePresented(metadata.screenOpen);
        target.style.cursor = povCursor(metadata.cursorShape);
        if (playerStore.get().capture === "captured" && screenChanged) {
          const doc = target.ownerDocument;
          if (metadata.screenOpen && doc.pointerLockElement === target) {
            unlockingForScreen.current = true;
            doc.exitPointerLock();
          } else if (!metadata.screenOpen && !touch) {
            // Browsers may require another click to regain pointer lock.
            void lockPovPointer(target).catch(release);
          }
        }
        if (
          metadata.screenOpen &&
          playerStore.get().capture === "captured" &&
          !touch
        )
          textInputRef.current?.focus({ preventScroll: true });
        if (playerStore.get().capture === "captured")
          session.current?.capture(true);
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
          if (audioSupportedRef.current === null) {
            const supported = frame.audioEnabled !== undefined;
            audioSupportedRef.current = supported;
            setAudioSupported(supported);
          }
          if (frame.audioError && audioRef.current) {
            muteAudio();
            toast.error(frame.audioError);
          }
          audioRef.current?.accept(frame.audio);
          decoder?.accept(frame);
        },
        failed,
        () => {
          feedback.reset();
          metrics?.reconnect();
          decoder?.reset();
          presenter.reset();
          audioRef.current?.reset();
          audioSupportedRef.current = null;
          setAudioSupported(null);
          actions.disconnected();
        },
        () => (decoder ? feedback.sample(decoder.stats) : undefined),
        undefined,
        (text) =>
          copyMinecraftText(
            text,
            canvasRef.current?.ownerDocument.defaultView ?? window,
          ),
        (value) =>
          openMinecraftUrl(
            value,
            canvasRef.current?.ownerDocument.defaultView ?? window,
            release,
          ),
      );
    } catch (reason) {
      actions.setError(
        reason instanceof Error ? reason.message : "Unable to start POV.",
      );
    }
    return () => {
      disposed = true;
      muteAudio();
      actions.disconnected();
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
  }, [
    playing,
    isOnline,
    instanceId,
    botId,
    retry,
    release,
    metrics,
    touch,
    actions,
    playerStore,
    muteAudio,
  ]);

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
          (playerStore.get().capture !== "captured" &&
            playerStore.get().capture !== "pending") ||
          playerStore.get().screenOpen
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
      if (playerStore.get().capture === "captured") {
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
            playerStore.get().capture !== "captured" ||
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
      if (playerStore.get().capture !== "captured") return;
      const pressed = event.type === "keydown";
      if (pressed && isPovReleaseShortcut(event, isMac)) {
        event.preventDefault();
        event.stopPropagation();
        release();
        return;
      }
      const typing =
        playerStore.get().screenOpen && event.target === textInputRef.current;
      const shortcutKey = textShortcutKey(event);
      if (
        pressed &&
        typing &&
        (event.ctrlKey || event.metaKey) &&
        shortcutKey === "v"
      )
        return;
      const input = keyInput(event, pressed, typing);
      if (!input) return;
      if (!pressed) {
        // A modifier or IME change must not strand a previously pressed key.
        // Input ownership suppresses releases for keys this keyboard never sent.
        session.current?.enqueue(input);
        return;
      }
      const copying =
        typing &&
        isTextEditingShortcut(event) &&
        (shortcutKey === "c" || shortcutKey === "x");
      if (!(typing && isTextInputKey(event))) event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        if (!event.repeat) {
          escapeForwarded = true;
          session.current?.escape();
        }
        return;
      }
      session.current?.enqueue(input);
      if (copying) session.current?.copy();
      if (
        !typing &&
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
    const beforeText = (event: InputEvent) => {
      if (
        playerStore.get().capture !== "captured" ||
        !playerStore.get().screenOpen
      )
        return;
      const edits = textEditEvents(event);
      if (!edits.length) return;
      event.preventDefault();
      for (const input of edits) session.current?.enqueue(input);
    };
    const text = (event: Event) => {
      if (!textInput) return;
      if (
        playerStore.get().capture !== "captured" ||
        !playerStore.get().screenOpen
      ) {
        // A late IME commit after release must not enter the next capture.
        textInput.value = "";
        return;
      }
      if ((event as InputEvent).isComposing) return;
      for (const input of textInputEvents(textInput.value))
        session.current?.enqueue(input);
      textInput.value = "";
    };
    const paste = (event: ClipboardEvent) => {
      if (
        playerStore.get().capture !== "captured" ||
        !playerStore.get().screenOpen
      )
        return;
      event.preventDefault();
      session.current?.paste(event.clipboardData?.getData("text/plain") ?? "");
    };
    textInput?.addEventListener("beforeinput", beforeText);
    textInput?.addEventListener("input", text);
    textInput?.addEventListener("compositionend", text);
    textInput?.addEventListener("paste", paste);
    const gamepad = new PovGamepad();
    let padFrame = 0;
    let padTime = win.performance.now();
    const pollPad = (now: number) => {
      const seconds = Math.min(0.05, (now - padTime) / 1000);
      padTime = now;
      if (
        playerStore.get().capture === "captured" &&
        playerStore.get().connected
      ) {
        const pad =
          Array.from(win.navigator.getGamepads?.() ?? []).find(
            (pad) => pad?.connected && pad.mapping === "standard",
          ) ?? null;
        if (pad?.buttons[8]?.pressed && pad.buttons[9]?.pressed) {
          release();
          gamepad.reset();
        } else
          for (const event of gamepad.sample(
            pad,
            seconds,
            playerStore.get().screenOpen,
          ))
            session.current?.enqueue(event, "gamepad");
      } else gamepad.reset();
      padFrame = win.requestAnimationFrame(pollPad);
    };
    padFrame = win.requestAnimationFrame(pollPad);
    const touches = new Map<number, { x: number; y: number }>();
    const touchStart = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" ||
        playerStore.get().capture !== "captured"
      )
        return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (playerStore.get().screenOpen) {
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
      if (!previous || playerStore.get().capture !== "captured") return;
      event.preventDefault();
      if (playerStore.get().screenOpen) moveInScreen(event);
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
    const heldButtons = heldMouseButtons.current;
    const moveInScreen = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      enqueue({
        kind: PovInputEvent_Kind.MOVE,
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      });
    };
    const move = (event: MouseEvent) => {
      if (playerStore.get().capture !== "captured") return;
      if (playerStore.get().screenOpen) {
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
      if (playerStore.get().capture !== "captured") return;
      const pressed = event.type === "mousedown";
      if (playerStore.get().screenOpen) {
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
      if (playerStore.get().capture !== "captured") return;
      event.preventDefault();
      enqueue(scrollInput(event));
    };
    const context = (event: Event) => {
      if (playerStore.get().capture === "captured" && event.target === canvas)
        event.preventDefault();
    };
    const fullscreenChange = () => {
      const active = doc.fullscreenElement === rootRef.current;
      actions.setFullscreen(active);
      // Keyboard Lock is only available after fullscreen has been entered.
      if (active && playerStore.get().capture === "captured") {
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
      textInput?.removeEventListener("beforeinput", beforeText);
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
  }, [canvas, release, actions, playerStore]);

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
      actions.setFullscreen(false);
    };
    popup.addEventListener("pagehide", closed);
    return () => {
      themeObserver.disconnect();
      popup.removeEventListener("pagehide", closed);
      popup.close();
      // Activity retains state while disconnecting this effect's window.
      setPopup((current) => (current === popup ? null : current));
      actions.setFullscreen(false);
    };
  }, [popup, release, actions.setFullscreen]);

  const attachCanvas = useCallback((node: HTMLCanvasElement | null) => {
    presenterRef.current?.reset();
    canvasRef.current = node;
    setCanvas(node);
  }, []);

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
      if (!playerStore.get().screenOpen) {
        if (!touch) await lockPovPointer(canvas);
      } else if (!touch) textInputRef.current?.focus({ preventScroll: true });
      if (!actions.isCurrentCapture(attempt)) return;
      if (canvasRef.current !== canvas || !actions.completeCapture(attempt)) {
        release();
        return;
      }
      session.current?.capture(true);
      if (!actions.isCurrentCapture(attempt)) return;
      if (!touch)
        toast.info(
          `Press ${releaseShortcut} to release your keyboard and mouse.`,
          {
            id: captureToastId,
            toasterId: captureToastId,
            duration: 4000,
            style: { pointerEvents: "none" },
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
      if (!actions.isCurrentCapture(attempt)) return;
      release();
      actions.setCaptureError(
        error instanceof Error
          ? `${error.message} Click to play and allow mouse/keyboard capture.`
          : "Click to play and allow mouse/keyboard capture.",
      );
    }
  }, [
    canvas,
    connected,
    captureToastId,
    releaseShortcut,
    release,
    touch,
    actions,
    playerStore,
  ]);

  function detach() {
    release();
    const child = window.open(
      "about:blank",
      "soulfire-pov",
      "popup,width=1280,height=800",
    );
    if (!child) {
      toast.error("Allow popups to detach the POV window.", {
        toasterId: captureToastId,
      });
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
        // Raw pointer input may need an asynchronous fallback. Finish capture
        // before fullscreen consumes the gesture needed by that retry.
        if (connected) await capture();
        await root.requestFullscreen();
      }
    } catch {
      toast.error("Fullscreen is unavailable in this window.", {
        toasterId: captureToastId,
      });
    }
  }

  const immersive = fullscreen || popup !== null;
  const audioControls = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={
          !isOnline || !connected || !playing || audioSupported !== true
        }
        title={
          audioSupported === null
            ? playing
              ? "Waiting for POV to connect."
              : "Watch the bot to use audio."
            : audioSupported
              ? undefined
              : "Update the server to use POV audio."
        }
        aria-label={audioEnabled ? "Mute audio" : "Unmute audio"}
        aria-pressed={audioEnabled}
        onClick={() => void toggleAudio()}
      >
        {audioEnabled ? <Volume2Icon /> : <VolumeXIcon />}
        {audioStarting
          ? "Starting audio…"
          : audioEnabled
            ? "Mute"
            : audioSupported === null
              ? "Audio"
              : audioSupported
                ? "Unmute"
                : "Audio unavailable"}
      </Button>
      {audioEnabled && (
        <Field className="w-24">
          <FieldLabel id={volumeLabelId} className="sr-only">
            POV volume
          </FieldLabel>
          <Slider
            aria-labelledby={volumeLabelId}
            min={0}
            max={100}
            value={[volume]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (next === undefined) return;
              setVolume(next);
              audioRef.current?.volume(next / 100);
            }}
          />
        </Field>
      )}
    </div>
  );
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
              actions.setPlaying(!playing);
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
          {audioControls}
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
      {touch && captured && (
        <PovTouchToolbar
          screenOpen={guiOpen}
          keyboard={() => textInputRef.current?.focus()}
          closeMenu={() => session.current?.escape()}
          release={release}
        />
      )}
      <div
        className={`relative ${touch && captured && !immersive ? "min-h-60" : "min-h-0"} overflow-hidden bg-black ${immersive ? "" : "rounded-lg"} ${popup || fullscreen ? "flex-1" : "aspect-video"}`}
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
            screenOpen={guiOpen}
          />
        )}
        {!captured && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
            {error ? (
              <div className="flex max-w-md flex-col items-center gap-3 p-4 text-center">
                <p role="alert">{error}</p>
                <Button
                  onClick={() => {
                    actions.reconnect();
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
                  actions.setPlaying(true);
                }}
              >
                <PlayIcon data-icon="inline-start" />
                Watch bot
              </Button>
            ) : !connected || capturePending ? (
              <p>Connecting…</p>
            ) : (
              <button
                type="button"
                onClick={capture}
                className="absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
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
      {immersive && !captured && (
        <div className="flex items-center gap-2 p-2">{audioControls}</div>
      )}
      {!immersive && (
        <p className="text-muted-foreground text-xs">
          {touch
            ? captured
              ? "Controlling Minecraft. Use Leave control to stop."
              : "Play enables touch controls."
            : captured
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
