type AudioPacket = { data: Uint8Array; timestampUs: bigint };

const CONFIG: AudioDecoderConfig = {
  codec: "opus",
  sampleRate: 48_000,
  numberOfChannels: 2,
};

// Keep a short jitter buffer and discard stale sound after stalls or reconnects.
export class PovAudioPlayer {
  private readonly decoder: AudioDecoder;
  private readonly gain: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private originTimestamp: number | undefined;
  private originTime = 0;
  private lastTimestamp = -1;
  private closed = false;

  static async create(
    volume: number,
    onError: (error: Error) => void,
    signal?: AbortSignal,
  ) {
    if (
      typeof AudioDecoder === "undefined" ||
      typeof AudioContext === "undefined"
    )
      throw new Error("POV audio is unavailable in this browser.");
    // Resume inside the click handler, before awaiting codec support.
    const context = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 48_000,
    });
    let rejectAbort: (reason: unknown) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const cancelled = () => {
      void context.close().catch(() => {});
      rejectAbort(signal?.reason);
    };
    signal?.addEventListener("abort", cancelled, { once: true });
    try {
      signal?.throwIfAborted();
      await Promise.race([context.resume(), aborted]);
      signal?.throwIfAborted();
      if (
        !(await Promise.race([AudioDecoder.isConfigSupported(CONFIG), aborted]))
          .supported
      )
        throw new Error("This browser cannot decode POV audio.");
      signal?.throwIfAborted();
      if (context.state !== "running")
        throw new Error("Audio playback was blocked. Click Unmute to retry.");
      return new PovAudioPlayer(context, volume, onError);
    } catch (error) {
      if (context.state !== "closed") await context.close();
      throw error;
    } finally {
      signal?.removeEventListener("abort", cancelled);
    }
  }

  constructor(
    private readonly context: AudioContext,
    volume: number,
    private readonly onError: (error: Error) => void,
  ) {
    this.gain = context.createGain();
    this.gain.connect(context.destination);
    this.volume(volume);
    this.decoder = new AudioDecoder({
      output: (data) => this.present(data),
      error: (error) => this.fail(error),
    });
    this.decoder.configure(CONFIG);
  }

  volume(value: number) {
    if (!Number.isFinite(value)) return;
    this.gain.gain.setTargetAtTime(
      Math.min(1, Math.max(0, value)),
      this.context.currentTime,
      0.01,
    );
  }

  accept(packets: readonly AudioPacket[]) {
    if (this.closed) return;
    try {
      if (this.decoder.decodeQueueSize > 8) this.reset();
      for (const packet of packets.slice(-5)) {
        if (!packet.data.length || packet.data.length > 4_096) continue;
        this.decoder.decode(
          new EncodedAudioChunk({
            type: "key",
            timestamp: Number(packet.timestampUs),
            duration: 20_000,
            data: packet.data,
          }),
        );
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  reset() {
    if (this.closed) return;
    this.clearPlayback();
    this.decoder.reset();
    this.decoder.configure(CONFIG);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearPlayback();
    if (this.decoder.state !== "closed") this.decoder.close();
    this.gain.disconnect();
    void this.context.close().catch(() => {});
  }

  private clearPlayback() {
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    this.originTimestamp = undefined;
    this.lastTimestamp = -1;
  }

  private present(data: AudioData) {
    try {
      if (
        this.closed ||
        this.context.state !== "running" ||
        data.timestamp <= this.lastTimestamp
      )
        return;
      if (
        data.numberOfChannels !== 2 ||
        data.sampleRate !== 48_000 ||
        data.numberOfFrames > 4_800
      )
        throw new Error("The server sent an invalid audio frame.");
      const now = this.context.currentTime;
      let when =
        this.originTimestamp === undefined
          ? now + 0.04
          : this.originTime +
            (data.timestamp - this.originTimestamp) / 1_000_000;
      if (
        this.originTimestamp === undefined ||
        when < now - 0.04 ||
        when > now + 0.15
      ) {
        this.clearPlayback();
        this.originTimestamp = data.timestamp;
        this.originTime = now + 0.04;
        when = this.originTime;
      }
      this.lastTimestamp = data.timestamp;
      const buffer = this.context.createBuffer(
        2,
        data.numberOfFrames,
        data.sampleRate,
      );
      for (let channel = 0; channel < 2; channel++)
        data.copyTo(buffer.getChannelData(channel), {
          planeIndex: channel,
          format: "f32-planar",
        });
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
      };
      source.start(Math.max(now, when));
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    } finally {
      data.close();
    }
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.close();
    this.onError(error);
  }
}
