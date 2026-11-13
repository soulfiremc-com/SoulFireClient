import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
} from "@/generated/soulfire/pov_pb";
import { PovInputSources } from "./pov-input-sources";

export class PovInputQueue {
  private events: PovInputEvent[] = [];
  private sources = new PovInputSources();

  get length(): number {
    return this.events.length;
  }

  get isFull(): boolean {
    return this.events.length >= 128;
  }

  enqueue(event: PovInputEvent, source: string): boolean {
    if (!this.sources.accept(event, source)) return true;
    const previous = this.events[this.events.length - 1];
    // Native screen drags need every absolute position along the path.
    if (
      previous &&
      event.kind === Kind.MOVE &&
      previous.kind === Kind.MOVE &&
      previous.relative === event.relative &&
      (event.relative || !this.sources.hasPressedButtons)
    ) {
      previous.x = event.relative ? previous.x + event.x : event.x;
      previous.y = event.relative ? previous.y + event.y : event.y;
      return true;
    }
    if (this.isFull) return false;
    this.events.push(event);
    return true;
  }

  drain(): PovInputEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  reset(): void {
    this.events = [];
    this.sources.reset();
  }
}
