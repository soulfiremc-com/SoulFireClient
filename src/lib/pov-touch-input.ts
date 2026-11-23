import { create } from "@bufbuild/protobuf";
import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";
import { PovInputSources } from "./pov-input-sources";

export interface TouchControl {
  readonly code: number;
  readonly mouse?: boolean;
}

// Each finger owns its controls until it lifts or the visible controls change.
export class PovTouchInput {
  private readonly pointers = new Map<number, Map<string, TouchControl>>();
  private readonly sources = new PovInputSources();

  update(pointer: number, controls: readonly TouchControl[]): PovInputEvent[] {
    const previous =
      this.pointers.get(pointer) ?? new Map<string, TouchControl>();
    const next = new Map(
      controls.map((control) => [
        `${Boolean(control.mouse)}:${control.code}`,
        control,
      ]),
    );
    const events: PovInputEvent[] = [];
    const change = (control: TouchControl, action: number) => {
      const event = create(PovInputEventSchema, {
        kind: control.mouse ? Kind.BUTTON : Kind.KEY,
        code: control.code,
        action,
      });
      if (this.sources.accept(event, String(pointer))) events.push(event);
    };
    for (const [id, control] of previous) if (!next.has(id)) change(control, 0);
    for (const [id, control] of next) if (!previous.has(id)) change(control, 1);
    if (next.size > 0) this.pointers.set(pointer, next);
    else this.pointers.delete(pointer);
    return events;
  }

  release(pointer: number): PovInputEvent[] {
    return this.update(pointer, []);
  }

  reset(): PovInputEvent[] {
    const events = Array.from(this.pointers.keys()).flatMap((pointer) =>
      this.release(pointer),
    );
    this.sources.reset();
    return events;
  }
}

/** Input source for the touch control buttons and joystick. */
export const POV_TOUCH_CONTROLS_SOURCE = "touch-controls";

interface PovCanvasTouchInput {
  readonly event: PovInputEvent;
  readonly source: string;
}

// Fingers on the canvas drag the camera, or click while a screen is open. Each
// finger is its own input source and releases only the button it pressed, so
// a camera drag cannot release the on-screen Attack button.
export class PovCanvasTouches {
  private readonly pointers = new Map<
    number,
    { x: number; y: number; pressed: boolean }
  >();

  start(
    pointer: number,
    x: number,
    y: number,
    screenOpen: boolean,
  ): PovCanvasTouchInput | null {
    this.pointers.set(pointer, { x, y, pressed: screenOpen });
    return screenOpen ? this.button(pointer, 1) : null;
  }

  /** Returns the movement since the last position, or null for unknown fingers. */
  move(pointer: number, x: number, y: number): { x: number; y: number } | null {
    const previous = this.pointers.get(pointer);
    if (!previous) return null;
    this.pointers.set(pointer, { ...previous, x, y });
    return { x: x - previous.x, y: y - previous.y };
  }

  end(pointer: number): PovCanvasTouchInput | null {
    const previous = this.pointers.get(pointer);
    this.pointers.delete(pointer);
    return previous?.pressed ? this.button(pointer, 0) : null;
  }

  reset(): void {
    this.pointers.clear();
  }

  private button(pointer: number, action: number): PovCanvasTouchInput {
    return {
      event: create(PovInputEventSchema, {
        kind: Kind.BUTTON,
        code: 0,
        action,
      }),
      source: `touch:${pointer}`,
    };
  }
}
