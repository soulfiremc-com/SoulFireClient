import { create } from "@bufbuild/protobuf";
import {
  PovInputEvent_Kind as Kind,
  type PovInputEvent,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";

const deadzone = (value: number) =>
  Math.abs(value) < 0.18
    ? 0
    : (Math.sign(value) * (Math.abs(value) - 0.18)) / 0.82;

// Standard gamepad mapping. Changes emit edges; analog look is time-based.
export class PovGamepad {
  private held = new Map<string, PovInputEvent>();
  private x = 0.5;
  private y = 0.5;
  sample(
    pad: Gamepad | null,
    seconds: number,
    screen: boolean,
  ): PovInputEvent[] {
    const events: PovInputEvent[] = [];
    const next = new Map<string, PovInputEvent>();
    const hold = (kind: Kind, code: number, pressed: boolean) => {
      if (pressed)
        next.set(
          `${kind}:${code}`,
          create(PovInputEventSchema, { kind, code, action: 1 }),
        );
    };
    if (pad?.mapping === "standard") {
      const button = (index: number) => pad.buttons[index]?.pressed ?? false;
      const x = deadzone(pad.axes[0] ?? 0);
      const y = deadzone(pad.axes[1] ?? 0);
      if (!screen) {
        hold(Kind.KEY, 87, y < -0.25);
        hold(Kind.KEY, 83, y > 0.25);
        hold(Kind.KEY, 65, x < -0.25);
        hold(Kind.KEY, 68, x > 0.25);
        hold(Kind.KEY, 32, button(0));
        hold(Kind.KEY, 340, button(1));
        hold(Kind.KEY, 81, button(2));
        hold(Kind.KEY, 69, button(3));
        hold(Kind.KEY, 341, button(10));
        hold(Kind.BUTTON, 0, button(7));
        hold(Kind.BUTTON, 1, button(6));
      } else {
        hold(Kind.BUTTON, 0, button(0) || button(7));
        hold(Kind.BUTTON, 1, button(2) || button(6));
        hold(Kind.KEY, 256, button(1));
        this.x = Math.max(0, Math.min(1, this.x + x * seconds));
        this.y = Math.max(0, Math.min(1, this.y + y * seconds));
        if (x || y)
          events.push(
            create(PovInputEventSchema, {
              kind: Kind.MOVE,
              x: this.x,
              y: this.y,
            }),
          );
      }
      hold(Kind.KEY, 256, button(9) || (screen && button(1)));
      hold(Kind.KEY, 69, button(3));
      for (const [index, direction] of [
        [4, 1],
        [5, -1],
      ] as const) {
        const id = `scroll:${index}`;
        if (button(index)) {
          const event = create(PovInputEventSchema, {
            kind: Kind.SCROLL,
            y: direction,
          });
          next.set(id, event);
        }
      }
      if (!screen) {
        const lookX =
          deadzone(pad.axes[2] ?? 0) * Math.min(seconds, 0.05) * 900;
        const lookY =
          deadzone(pad.axes[3] ?? 0) * Math.min(seconds, 0.05) * 900;
        if (lookX || lookY)
          events.push(
            create(PovInputEventSchema, {
              kind: Kind.MOVE,
              x: lookX,
              y: lookY,
              relative: true,
            }),
          );
      }
    }
    for (const [id, event] of this.held)
      if (!next.has(id) && event.kind !== Kind.SCROLL)
        events.push(create(PovInputEventSchema, { ...event, action: 0 }));
    for (const [id, event] of next) if (!this.held.has(id)) events.push(event);
    this.held = next;
    return events;
  }
  reset() {
    this.held.clear();
  }
}
