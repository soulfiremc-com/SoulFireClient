import type { PovFrame } from "@/generated/soulfire/pov_pb";

// Inter-frame video chunks cannot be discarded independently. Reset to a new keyframe
// whenever decoding falls behind, rather than displaying an ever-older queue.
export class PovVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private configuration = "";
  private generation = 0;
  private waitingForKey = true;
  private lastSequence = 0n;
  private lastKeyRequest = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private recoveries = 0;
  private closed = false;
  private readonly metadata = new Map<number, PovFrame>();

  constructor(
    private readonly output: (frame: VideoFrame, metadata: PovFrame) => void,
    private readonly requestKeyFrame: () => void,
    private readonly error: (error: Error) => void,
  ) {
    if (typeof VideoDecoder === "undefined") {
      throw new Error(
        "Live POV requires a browser with WebCodecs video decoding in a secure context.",
      );
    }
  }

  get stats() {
    return {
      recoveries: this.recoveries,
      queued: this.decoder?.decodeQueueSize ?? 0,
      pending: this.metadata.size,
      waitingForKey: this.waitingForKey,
    };
  }

  reset() {
    this.generation++;
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = null;
    this.configuration = "";
    this.waitingForKey = true;
    this.lastSequence = 0n;
    this.lastKeyRequest = Number.NEGATIVE_INFINITY;
    this.metadata.clear();
  }

  close() {
    this.closed = true;
    this.reset();
  }

  private requestKey() {
    if (performance.now() - this.lastKeyRequest < 250) return;
    this.lastKeyRequest = performance.now();
    this.requestKeyFrame();
  }

  accept(chunk: PovFrame) {
    if (this.closed) return;
    const configuration = `${chunk.codec}/${chunk.width}/${chunk.height}`;
    if (this.configuration !== configuration) {
      this.reset();
      this.configuration = configuration;
      void this.configure(chunk, this.generation);
      return;
    }
    const decoder = this.decoder;
    if (decoder?.state !== "configured") return;
    if (
      decoder.decodeQueueSize >= 4 ||
      this.metadata.size >= 8 ||
      (this.lastSequence !== 0n && chunk.sequence !== this.lastSequence + 1n)
    ) {
      this.recoveries++;
      this.reset();
      this.requestKey();
      return;
    }
    this.lastSequence = chunk.sequence;
    if (this.waitingForKey && !chunk.keyFrame) {
      this.requestKey();
      return;
    }
    if (chunk.keyFrame) this.waitingForKey = false;
    const timestamp = Number(chunk.timestampUs);
    this.metadata.set(timestamp, chunk);
    try {
      decoder.decode(
        new EncodedVideoChunk({
          type: chunk.keyFrame ? "key" : "delta",
          timestamp,
          data: chunk.data,
        }),
      );
    } catch (reason) {
      this.recover(reason);
    }
  }

  private recover(reason: unknown) {
    if (this.closed) return;
    this.recoveries++;
    this.reset();
    if (++this.failures > 3) {
      this.error(reason instanceof Error ? reason : new Error(String(reason)));
    } else this.requestKey();
  }

  private async configure(chunk: PovFrame, generation: number) {
    try {
      const config: VideoDecoderConfig = {
        codec: chunk.codec,
        codedWidth: chunk.width,
        codedHeight: chunk.height,
        optimizeForLatency: true,
        hardwareAcceleration: "prefer-hardware",
      };
      let support = await VideoDecoder.isConfigSupported(config);
      if (!support.supported) {
        config.hardwareAcceleration = "no-preference";
        support = await VideoDecoder.isConfigSupported(config);
      }
      if (this.closed || generation !== this.generation) return;
      if (!support.supported)
        throw new Error(
          "This browser cannot decode the negotiated POV video stream.",
        );
      this.decoder = new VideoDecoder({
        output: (frame) => {
          try {
            if (this.closed || generation !== this.generation) return;
            const metadata = this.metadata.get(frame.timestamp);
            this.metadata.delete(frame.timestamp);
            if (metadata) {
              this.failures = 0;
              this.output(frame, metadata);
            }
          } finally {
            frame.close();
          }
        },
        error: (error) => {
          if (generation === this.generation) this.recover(error);
        },
      });
      this.decoder.configure(config);
      // Frames arriving during capability detection were discarded. Resume at a fresh IDR.
      this.requestKey();
    } catch (reason) {
      if (!this.closed && generation === this.generation)
        this.error(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
    }
  }
}
