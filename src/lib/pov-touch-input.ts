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
  private pointers = new Map<number, Map<string, TouchControl>>();
  private sources = new PovInputSources();

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
    if (next.size) this.pointers.set(pointer, next);
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
