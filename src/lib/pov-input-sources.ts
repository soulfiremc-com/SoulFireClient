import {
  PovInputEvent_Kind as Kind,
  type PovInputEvent,
} from "@/generated/soulfire/pov_pb";

// Releasing a controller key must not release a key still held on the keyboard.
export class PovInputSources {
  private held = new Map<string, Set<string>>();
  accept(event: PovInputEvent, source: string): boolean {
    if (event.kind !== Kind.KEY && event.kind !== Kind.BUTTON) return true;
    const id = `${event.kind}:${event.code}`;
    const owners = this.held.get(id) ?? new Set<string>();
    const wasHeld = owners.size > 0;
    if (event.action === 0) owners.delete(source);
    else owners.add(source);
    if (owners.size) this.held.set(id, owners);
    else this.held.delete(id);
    return event.action === 2 || wasHeld !== owners.size > 0;
  }
  reset() {
    this.held.clear();
  }
}
