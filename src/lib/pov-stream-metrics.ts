import type { PovFrame } from "@/generated/soulfire/pov_pb";

export const POV_DEBUG_STORAGE_KEY = "soulfire.pov.debug";

export function povDebugEnabled() {
  try {
    return localStorage.getItem(POV_DEBUG_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// All timing uses the client's clock. Receive-to-draw excludes server/network
// time and must not be presented as end-to-end latency.
export class PovStreamMetrics {
  constructor(private started = performance.now()) {}
  private received = 0;
  private drawn = 0;
  private bytes = 0;
  private keys = 0;
  private drawMs = 0;
  private timedDraws = 0;
  private lastReceived: number | null = null;
  private arrivals = new Map<bigint, number>();
  private targetBitrate = 0;
  private format = "Waiting for video";
  decoder:
    | (() => { pending: number; queued: number; waitingForKey: boolean })
    | null = null;

  receive(frame: PovFrame, now = performance.now()) {
    this.received++;
    this.targetBitrate = frame.targetBitrate;
    this.bytes += frame.data.byteLength;
    if (frame.keyFrame) this.keys++;
    this.lastReceived = now;
    this.format = `${frame.width} × ${frame.height} · ${frame.codec}`;
    this.arrivals.set(frame.sequence, now);
    // Decoder resets can discard frames. Never retain an unbounded history.
    if (this.arrivals.size > 32)
      this.arrivals.delete(this.arrivals.keys().next().value!);
  }

  draw(frame: PovFrame, now = performance.now()) {
    this.drawn++;
    const arrived = this.arrivals.get(frame.sequence);
    if (arrived !== undefined) {
      this.drawMs += now - arrived;
      this.timedDraws++;
      this.arrivals.delete(frame.sequence);
    }
  }

  reconnect() {
    this.arrivals.clear();
  }

  sample(now = performance.now()) {
    const seconds = Math.max(0.001, (now - this.started) / 1000);
    const snapshot = {
      format: this.format,
      targetMbps: this.targetBitrate / 1_000_000,
      receivedFps: this.received / seconds,
      drawnFps: this.drawn / seconds,
      mbps: (this.bytes * 8) / seconds / 1_000_000,
      frameKiB: this.received ? this.bytes / this.received / 1024 : 0,
      keyframes: this.keys / seconds,
      receiveToDrawMs: this.timedDraws ? this.drawMs / this.timedDraws : null,
      frameAgeMs: this.lastReceived === null ? null : now - this.lastReceived,
      ...this.decoder?.(),
    };
    this.started = now;
    this.received =
      this.drawn =
      this.bytes =
      this.keys =
      this.drawMs =
      this.timedDraws =
        0;
    return snapshot;
  }
}
