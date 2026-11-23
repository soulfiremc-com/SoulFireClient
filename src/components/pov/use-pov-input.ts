import { create } from "@bufbuild/protobuf";
import { type RefObject, useEffect } from "react";
import {
  PovInputEvent_Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";
import { desktop, isDesktopApp, isMac } from "@/lib/desktop";
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
import type { PovSession } from "@/lib/pov-session";
import { textEditEvents, textInputEvents } from "@/lib/pov-text-input";
import { PovCanvasTouches } from "@/lib/pov-touch-input";
import { isCaptured, type PovPlayerStore } from "@/stores/pov-player-store";
import { type KeyboardCapture, POV_LOCKED_KEYS } from "./use-pov-capture";

// Forwards keyboard, mouse, wheel, touch, and text input to the bot while the
// user controls it, and releases control when the window loses focus.
export function usePovInput({
  canvas,
  playerStore,
  sessionRef,
  rootRef,
  textInputRef,
  heldMouseButtonsRef,
  unlockingForScreenRef,
  release,
}: {
  canvas: HTMLCanvasElement | null;
  playerStore: PovPlayerStore;
  sessionRef: RefObject<PovSession | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  heldMouseButtonsRef: RefObject<Set<number>>;
  unlockingForScreenRef: RefObject<boolean>;
  release: () => void;
}) {
  const actions = playerStore.actions;
  useEffect(() => {
    if (!canvas) return undefined;
    const doc = canvas.ownerDocument;
    const win = doc.defaultView;
    if (!win) return undefined;
    const captured = () => isCaptured(playerStore.get());
    const typingAllowed = () => captured() && playerStore.get().screenOpen;
    const send = (event: ReturnType<typeof keyInput>, source?: string) => {
      if (event) sessionRef.current?.enqueue(event, source);
    };
    const enqueue = (
      values: Parameters<typeof create<typeof PovInputEventSchema>>[1],
    ) => {
      send(create(PovInputEventSchema, values));
    };
    let escapeForwarded = false;
    const locked = () => {
      if (doc.pointerLockElement === canvas) {
        escapeForwarded = false;
        const { capture, screenOpen } = playerStore.get();
        if (capture === "idle" || screenOpen) {
          unlockingForScreenRef.current = true;
          doc.exitPointerLock();
        }
        return;
      }
      if (unlockingForScreenRef.current) {
        escapeForwarded = false;
        unlockingForScreenRef.current = false;
        return;
      }
      if (captured()) {
        // Chromium may consume Escape before dispatching a keyboard event.
        if (doc.hasFocus() && !escapeForwarded) sessionRef.current?.escape();
        escapeForwarded = false;
        release();
      }
    };
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const listen = (subscribe: Promise<() => void>) => {
      void subscribe
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        })
        .catch(console.error);
    };
    // The desktop app reports releases and Escape for the window it captured.
    const ownsTarget = (target: string | undefined) =>
      (target === "pov") === (doc !== document);
    if (isDesktopApp()) {
      listen(
        desktop.pov.onReleased((target) => {
          if (ownsTarget(target)) release();
        }),
      );
      listen(
        desktop.pov.onEscape((event) => {
          if (!captured() || !ownsTarget(event.target)) return;
          enqueue({
            kind: PovInputEvent_Kind.KEY,
            code: 256,
            action: event.action,
            modifiers: event.modifiers,
          });
        }),
      );
    }
    const visibility = () => {
      if (doc.hidden) release();
    };
    const key = (event: KeyboardEvent) => {
      if (!captured()) return;
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
      // Let the browser fire a paste event with the clipboard text.
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
        send(input);
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
          sessionRef.current?.escape();
        }
        return;
      }
      send(input);
      if (copying) sessionRef.current?.copy();
      const code = event.key.codePointAt(0);
      if (
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        Array.from(event.key).length === 1 &&
        code !== undefined
      ) {
        enqueue({ kind: PovInputEvent_Kind.CHARACTER, code });
      }
    };
    const textInput = textInputRef.current;
    const beforeText = (event: InputEvent) => {
      if (!typingAllowed()) return;
      const edits = textEditEvents(event);
      if (edits.length === 0) return;
      event.preventDefault();
      for (const input of edits) send(input);
    };
    const text = (event: Event) => {
      if (!textInput) return;
      if (!typingAllowed()) {
        // A late IME commit after release must not enter the next capture.
        textInput.value = "";
        return;
      }
      if (event instanceof InputEvent && event.isComposing) return;
      for (const input of textInputEvents(textInput.value)) send(input);
      textInput.value = "";
    };
    const paste = (event: ClipboardEvent) => {
      if (!typingAllowed()) return;
      event.preventDefault();
      sessionRef.current?.paste(
        event.clipboardData?.getData("text/plain") ?? "",
      );
    };
    const moveInScreen = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      enqueue({
        kind: PovInputEvent_Kind.MOVE,
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
      });
    };
    const touches = new PovCanvasTouches();
    const touchStart = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !captured()) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const screenOpen = playerStore.get().screenOpen;
      if (screenOpen) moveInScreen(event);
      const press = touches.start(
        event.pointerId,
        event.clientX,
        event.clientY,
        screenOpen,
      );
      if (press) send(press.event, press.source);
    };
    const touchMove = (event: PointerEvent) => {
      if (!captured()) return;
      const delta = touches.move(event.pointerId, event.clientX, event.clientY);
      if (!delta) return;
      event.preventDefault();
      if (playerStore.get().screenOpen) moveInScreen(event);
      else
        enqueue({
          kind: PovInputEvent_Kind.MOVE,
          ...delta,
          relative: true,
        });
    };
    const touchEnd = (event: PointerEvent) => {
      const released = touches.end(event.pointerId);
      if (released) send(released.event, released.source);
    };
    const heldButtons = heldMouseButtonsRef.current;
    const move = (event: MouseEvent) => {
      if (!captured()) return;
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
      if (!captured()) return;
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
      if (!captured()) return;
      event.preventDefault();
      send(scrollInput(event));
    };
    const context = (event: Event) => {
      if (captured() && event.target === canvas) event.preventDefault();
    };
    const fullscreenChange = () => {
      const active = doc.fullscreenElement === rootRef.current;
      actions.setFullscreen(active);
      // Keyboard Lock is only available after fullscreen has been entered.
      if (active && captured()) {
        void (win.navigator as KeyboardCapture).keyboard
          ?.lock(POV_LOCKED_KEYS)
          .catch(() => {});
      }
    };
    textInput?.addEventListener("beforeinput", beforeText);
    textInput?.addEventListener("input", text);
    textInput?.addEventListener("compositionend", text);
    textInput?.addEventListener("paste", paste);
    canvas.addEventListener("pointerdown", touchStart);
    canvas.addEventListener("pointermove", touchMove);
    canvas.addEventListener("pointerup", touchEnd);
    canvas.addEventListener("pointercancel", touchEnd);
    canvas.addEventListener("wheel", wheel, { passive: false });
    doc.addEventListener("pointerlockchange", locked);
    doc.addEventListener("fullscreenchange", fullscreenChange);
    doc.addEventListener("visibilitychange", visibility);
    doc.addEventListener("keydown", key, true);
    doc.addEventListener("keyup", key, true);
    doc.addEventListener("mousemove", move);
    doc.addEventListener("mousedown", button);
    doc.addEventListener("mouseup", button);
    doc.addEventListener("contextmenu", context);
    win.addEventListener("blur", release);
    win.addEventListener("pagehide", release);
    return () => {
      disposed = true;
      textInput?.removeEventListener("beforeinput", beforeText);
      textInput?.removeEventListener("input", text);
      textInput?.removeEventListener("compositionend", text);
      textInput?.removeEventListener("paste", paste);
      canvas.removeEventListener("pointerdown", touchStart);
      canvas.removeEventListener("pointermove", touchMove);
      canvas.removeEventListener("pointerup", touchEnd);
      canvas.removeEventListener("pointercancel", touchEnd);
      canvas.removeEventListener("wheel", wheel);
      doc.removeEventListener("pointerlockchange", locked);
      doc.removeEventListener("fullscreenchange", fullscreenChange);
      doc.removeEventListener("visibilitychange", visibility);
      doc.removeEventListener("keydown", key, true);
      doc.removeEventListener("keyup", key, true);
      doc.removeEventListener("mousemove", move);
      doc.removeEventListener("mousedown", button);
      doc.removeEventListener("mouseup", button);
      doc.removeEventListener("contextmenu", context);
      win.removeEventListener("blur", release);
      win.removeEventListener("pagehide", release);
      for (const unlisten of unlisteners) unlisten();
      touches.reset();
      release();
    };
  }, [
    canvas,
    release,
    actions,
    playerStore,
    sessionRef,
    rootRef,
    textInputRef,
    heldMouseButtonsRef,
    unlockingForScreenRef,
  ]);
}
