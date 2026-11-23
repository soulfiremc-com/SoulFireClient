import { t } from "i18next";
import type { PovFrame } from "@/generated/soulfire/pov_pb";

// Inter-frame video chunks cannot be discarded independently. Reset to a new keyframe
// whenever decoding falls behind, rather than displaying an ever-older queue.
export class PovVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private config: VideoDecoderConfig | null = null;
  private configuration = "";
  private generation = 0;
  private waitingForKey = true;
  private lastSequence = 0n;
  private lastKeyRequest = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private recoveries = 0;
  private closed = false;
  private readonly metadata = new Map<number, PovFrame>();
  // Codec support does not change during a session. Remembering it lets a
  // resize reconfigure at once and decode the keyframe that announced it.
  private readonly acceleration = new Map<string, HardwareAcceleration>();

  private readonly output: (frame: VideoFrame, metadata: PovFrame) => void;
  private readonly requestKeyFrame: () => void;
  private readonly error: (error: Error) => void;

  constructor(
    output: (frame: VideoFrame, metadata: PovFrame) => void,
    requestKeyFrame: () => void,
    error: (error: Error) => void,
  ) {
    this.output = output;
    this.requestKeyFrame = requestKeyFrame;
    this.error = error;

    if (typeof VideoDecoder === "undefined") {
      throw new TypeError(t("instance:bots.pov.videoUnsupportedBrowser"));
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
    this.config = null;
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
      const acceleration = this.acceleration.get(chunk.codec);
      if (acceleration === undefined) {
        this.reset();
        this.configuration = configuration;
        void this.configure(chunk, this.generation);
        return;
      }
      try {
        this.reconfigure(chunk, acceleration);
      } catch (reason) {
        this.recover(reason);
        return;
      }
      this.configuration = configuration;
    }
    const decoder = this.decoder;
    if (decoder?.state !== "configured") return;
    if (
      decoder.decodeQueueSize >= 4 ||
      this.metadata.size >= 8 ||
      (this.lastSequence !== 0n && chunk.sequence !== this.lastSequence + 1n)
    ) {
      // A keyframe after a gap is the recovery point, so decode it at once.
      this.resync(decoder, !chunk.keyFrame);
      if (!chunk.keyFrame) return;
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

  // Drop queued work but keep the configured decoder. Rebuilding it would
  // discard the requested keyframe while codec support is checked again.
  private resync(decoder: VideoDecoder, requestKey: boolean) {
    this.recoveries++;
    this.metadata.clear();
    this.waitingForKey = true;
    this.lastSequence = 0n;
    if (this.config) {
      decoder.reset();
      decoder.configure(this.config);
    }
    if (!requestKey) return;
    // Always ask after a gap. Later delta frames reuse the throttle.
    this.lastKeyRequest = performance.now();
    this.requestKeyFrame();
  }

  private recover(reason: unknown) {
    if (this.closed) return;
    this.recoveries++;
    const lastKeyRequest = this.lastKeyRequest;
    this.reset();
    // Keep the throttle. The next chunk reconfigures and requests a keyframe.
    this.lastKeyRequest = lastKeyRequest;
    if (++this.failures > 3)
      this.error(reason instanceof Error ? reason : new Error(String(reason)));
  }

  // Keep the decoder for the same codec and wait for the next keyframe.
  private reconfigure(chunk: PovFrame, acceleration: HardwareAcceleration) {
    const config = decoderConfig(chunk, acceleration);
    const decoder = this.decoder;
    if (decoder?.state === "configured" && this.config?.codec === chunk.codec) {
      decoder.reset();
      decoder.configure(config);
      this.config = config;
      this.metadata.clear();
      this.waitingForKey = true;
      this.lastSequence = 0n;
      return;
    }
    this.reset();
    this.createDecoder(config, this.generation);
  }

  private async configure(chunk: PovFrame, generation: number) {
    try {
      const config = decoderConfig(chunk, "prefer-hardware");
      let support = await VideoDecoder.isConfigSupported(config);
      if (!support.supported) {
        config.hardwareAcceleration = "no-preference";
        support = await VideoDecoder.isConfigSupported(config);
      }
      if (this.closed || generation !== this.generation) return;
      if (!support.supported)
        throw new Error(t("instance:bots.pov.decoderUnsupported"));
      this.acceleration.set(
        chunk.codec,
        config.hardwareAcceleration ?? "no-preference",
      );
      this.createDecoder(config, generation);
      // Frames arriving during capability detection were discarded. Resume at a fresh IDR.
      this.requestKey();
    } catch (reason) {
      if (!this.closed && generation === this.generation)
        this.error(
          reason instanceof Error ? reason : new Error(String(reason)),
        );
    }
  }

  private createDecoder(config: VideoDecoderConfig, generation: number) {
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
    this.config = config;
  }
}

function decoderConfig(
  chunk: PovFrame,
  hardwareAcceleration: HardwareAcceleration,
): VideoDecoderConfig {
  return {
    codec: chunk.codec,
    codedWidth: chunk.width,
    codedHeight: chunk.height,
    optimizeForLatency: true,
    hardwareAcceleration,
  };
}
