import { useRef } from "react";
import { Button } from "@/components/ui/button";

export function PovTouchControls({
  keyEvent,
  buttonEvent,
  release,
  screenOpen,
  keyboard,
}: {
  keyEvent: (code: number, pressed: boolean) => void;
  buttonEvent: (code: number, pressed: boolean) => void;
  release: () => void;
  screenOpen: boolean;
  keyboard: () => void;
}) {
  const held = useRef(new Set<number>());
  const reset = () => {
    for (const code of held.current) keyEvent(code, false);
    held.current.clear();
  };
  const action = (
    event: React.PointerEvent<HTMLButtonElement>,
    pressed: boolean,
    code: number,
    mouse = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (pressed) event.currentTarget.setPointerCapture(event.pointerId);
    (mouse ? buttonEvent : keyEvent)(code, pressed);
  };
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="pointer-events-auto absolute top-3 right-3 flex touch-manipulation gap-2">
        {screenOpen && (
          <Button
            size="sm"
            variant="secondary"
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              keyboard();
            }}
            onClick={keyboard}
          >
            Keyboard
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            release();
          }}
          onClick={release}
        >
          Leave control
        </Button>
      </div>
      {!screenOpen && (
        <>
          <fieldset
            aria-label="Move"
            className="pointer-events-auto absolute bottom-6 left-6 flex size-28 touch-none items-center justify-center rounded-full border border-white/40 bg-black/30 text-white select-none"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = (event.clientX - rect.left) / rect.width - 0.5;
              const y = (event.clientY - rect.top) / rect.height - 0.5;
              const next = new Set<number>();
              if (x < -0.15) next.add(65);
              if (x > 0.15) next.add(68);
              if (y < -0.15) next.add(87);
              if (y > 0.15) next.add(83);
              for (const key of held.current)
                if (!next.has(key)) keyEvent(key, false);
              for (const key of next)
                if (!held.current.has(key)) keyEvent(key, true);
              held.current = next;
            }}
            onPointerUp={reset}
            onPointerCancel={reset}
            onLostPointerCapture={reset}
          >
            Move
          </fieldset>
          <div className="pointer-events-auto absolute right-6 bottom-6 grid grid-cols-2 gap-2">
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
                className="min-h-12 touch-none select-none"
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
        </>
      )}
    </div>
  );
}
