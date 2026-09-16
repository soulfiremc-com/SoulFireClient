import { create } from "@bufbuild/protobuf";
import {
  type PovFrame,
  PovStreamFeedbackSchema,
} from "@/generated/soulfire/pov_pb";

// Compare arrival spacing with the server's monotonic frame timestamps. The
// minimum observed offset removes clock differences and baseline network delay.
export class PovStreamFeedbackTracker {
  private offset = Number.POSITIVE_INFINITY;
  private delay = 0;
  private sequence = 0n;

  receive(frame: PovFrame, now = performance.now()) {
    const offset = now - Number(frame.timestampUs) / 1000;
    this.offset = Math.min(this.offset, offset);
    this.delay = Math.max(0, offset - this.offset);
    this.sequence = frame.sequence;
  }

  sample(stats: { queued: number; pending: number; recoveries: number }) {
    return create(PovStreamFeedbackSchema, {
      receivedSequence: this.sequence,
      deliveryDelayMs: this.delay,
      decoderQueueSize: Math.max(stats.queued, stats.pending),
      decoderRecoveries: stats.recoveries,
    });
  }

  reset() {
    this.offset = Number.POSITIVE_INFINITY;
    this.delay = 0;
    this.sequence = 0n;
  }
}
