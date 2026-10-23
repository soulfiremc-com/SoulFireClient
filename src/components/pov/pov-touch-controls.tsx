import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
} from "@/generated/soulfire/pov_pb";
import { PovTouchInput } from "@/lib/pov-touch-input";

export function PovTouchControls({
  keyEvent,
  buttonEvent,
  screenOpen,
}: {
  keyEvent: (code: number, pressed: boolean) => void;
  buttonEvent: (code: number, pressed: boolean) => void;
  screenOpen: boolean;
}) {
  const [input] = useState(() => new PovTouchInput());
  const send = (events: PovInputEvent[]) => {
    for (const event of events)
      (event.kind === Kind.BUTTON ? buttonEvent : keyEvent)(
        event.code,
        event.action !== 0,
      );
  };
  const releaseHeld = useEffectEvent(() => send(input.reset()));
  useEffect(() => () => releaseHeld(), [screenOpen]);
  const reset = (event: React.PointerEvent<HTMLElement>) =>
    send(input.release(event.pointerId));
  const action = (
    event: React.PointerEvent<HTMLButtonElement>,
    pressed: boolean,
    code: number,
    mouse = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
    send(input.update(event.pointerId, pressed ? [{ code, mouse }] : []));
  };
  if (screenOpen) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      onPointerDown={(event) => {
        // Suppress compatibility mouse events that would release capture.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <fieldset
        aria-label="Move"
        className="pointer-events-auto absolute bottom-4 left-4 flex size-20 touch-none items-center justify-center rounded-full border border-white/40 bg-black/30 text-white select-none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          const keys: number[] = [];
          if (x < -0.15) keys.push(65);
          if (x > 0.15) keys.push(68);
          if (y < -0.15) keys.push(87);
          if (y > 0.15) keys.push(83);
          send(
            input.update(
              event.pointerId,
              keys.map((code) => ({ code })),
            ),
          );
        }}
        onPointerUp={reset}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
      >
        Move
      </fieldset>
      <div className="pointer-events-auto absolute right-4 bottom-4 grid grid-cols-2 gap-2">
        {[
          { label: "Jump", code: 32 },
          { label: "Sneak", code: 340 },
          { label: "Attack", code: 0, mouse: true },
          { label: "Use", code: 1, mouse: true },
          { label: "Inventory", code: 69 },
        ].map((control) => (
          <Button
            key={control.label}
            variant="secondary"
            className="min-h-11 touch-none px-2 text-xs select-none"
            onPointerDown={(event) =>
              action(event, true, control.code, control.mouse)
            }
            onPointerUp={(event) =>
              action(event, false, control.code, control.mouse)
            }
            onPointerCancel={(event) =>
              action(event, false, control.code, control.mouse)
            }
            onLostPointerCapture={(event) =>
              action(event, false, control.code, control.mouse)
            }
          >
            {control.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function PovTouchToolbar({
  screenOpen,
  keyboard,
  closeMenu,
  release,
}: {
  screenOpen: boolean;
  keyboard: () => void;
  closeMenu: () => void;
  release: () => void;
}) {
  return (
    <div
      className="flex shrink-0 touch-manipulation flex-wrap justify-end gap-2 p-2"
      onPointerDown={(event) => {
        // Compatibility mouse events would release the native GUI capture.
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {screenOpen && (
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 px-2 text-xs"
          onClick={keyboard}
        >
          Keyboard
        </Button>
      )}
      {screenOpen && (
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 px-2 text-xs"
          onClick={closeMenu}
        >
          Close menu
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        className="min-h-11 px-2 text-xs"
        onClick={release}
      >
        Leave control
      </Button>
    </div>
  );
}
