import type { PovFrame } from "@/generated/soulfire/pov_pb";

// Own at most one decoded frame. A newer frame replaces stale work, never queues.
export class PovPresenter {
  private pending: { frame: VideoFrame; metadata: PovFrame } | null = null;
  private scheduled: number | null = null;
  private readonly draw: (frame: VideoFrame, metadata: PovFrame) => void;
  private readonly request: (callback: FrameRequestCallback) => number;
  private readonly cancel: (id: number) => void;
  private readonly paced: boolean;

  constructor(
    draw: (frame: VideoFrame, metadata: PovFrame) => void,
    request: (callback: FrameRequestCallback) => number,
    cancel: (id: number) => void,
    paced: boolean,
  ) {
    this.draw = draw;
    this.request = request;
    this.cancel = cancel;
    this.paced = paced;
  }

  present(frame: VideoFrame, metadata: PovFrame) {
    if (!this.paced) {
      this.draw(frame, metadata);
      return;
    }
    this.pending?.frame.close();
    this.pending = { frame: frame.clone(), metadata };
    if (this.scheduled !== null) return;
    this.scheduled = this.request(() => {
      this.scheduled = null;
      const pending = this.pending;
      this.pending = null;
      if (!pending) return;
      try {
        this.draw(pending.frame, pending.metadata);
      } finally {
        pending.frame.close();
      }
    });
  }

  reset() {
    if (this.scheduled !== null) this.cancel(this.scheduled);
    this.scheduled = null;
    this.pending?.frame.close();
    this.pending = null;
  }
}
