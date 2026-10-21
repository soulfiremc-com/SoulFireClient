import assert from "node:assert/strict";
import { test } from "node:test";
import { PovAudioPlayer } from "./pov-audio-player";

test("audio playback bounds latency and releases queued audio on reset and close", () => {
  const originalDecoder = globalThis.AudioDecoder;
  const originalChunk = globalThis.EncodedAudioChunk;
  const decoders: FakeDecoder[] = [];
  let dataCloses = 0;
  let contextCloses = 0;
  let gainDisconnected = false;
  let gain = 0;
  const sources: { when: number; stopped: boolean; disconnected: boolean }[] =
    [];
  class FakeDecoder {
    state: CodecState = "unconfigured";
    decodeQueueSize = 0;
    resets = 0;
    constructor(readonly init: AudioDecoderInit) {
      decoders.push(this);
    }
    configure() {
      this.state = "configured";
    }
    decode(chunk: EncodedAudioChunk) {
      this.output(chunk.timestamp);
    }
    output(timestamp: number) {
      this.init.output({
        timestamp,
        numberOfChannels: 2,
        numberOfFrames: 960,
        sampleRate: 48_000,
        copyTo: () => {},
        close() {
          dataCloses++;
        },
      } as unknown as AudioData);
    }
    reset() {
      this.resets++;
      this.state = "unconfigured";
    }
    close() {
      this.state = "closed";
    }
  }
  const context = {
    currentTime: 1,
    state: "running",
    destination: {},
    createGain: () => ({
      gain: {
        setTargetAtTime(value: number) {
          gain = value;
        },
      },
      connect: () => {},
      disconnect() {
        gainDisconnected = true;
      },
    }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(960) }),
    createBufferSource() {
      const source = { when: 0, stopped: false, disconnected: false };
      sources.push(source);
      return {
        buffer: null,
        connect: () => {},
        start(when: number) {
          source.when = when;
        },
        stop() {
          source.stopped = true;
        },
        disconnect() {
          source.disconnected = true;
        },
      };
    },
    close() {
      contextCloses++;
      this.state = "closed";
      return Promise.resolve();
    },
  };
  const errors: Error[] = [];
  try {
    globalThis.AudioDecoder = FakeDecoder as unknown as typeof AudioDecoder;
    globalThis.EncodedAudioChunk = class {
      constructor(init: EncodedAudioChunkInit) {
        Object.assign(this, init);
      }
    } as unknown as typeof EncodedAudioChunk;
    const player = new PovAudioPlayer(
      context as unknown as AudioContext,
      0.8,
      (error) => errors.push(error),
    );
    const decoder = decoders[0]!;
    const packet = (timestampUs: bigint) => ({
      timestampUs,
      data: new Uint8Array([1]),
    });
    player.accept([packet(0n), packet(20_000n)]);
    assert.deepEqual(
      sources.map((source) => source.when),
      [1.04, 1.06],
    );
    assert.equal(dataCloses, 2);
    player.volume(0.3);
    assert.equal(gain, 0.3);
    context.currentTime = 4;
    player.accept([packet(40_000n)]);
    assert.ok(sources[0]!.stopped && sources[1]!.stopped);
    assert.equal(sources[2]!.when, 4.04);
    decoder!.decodeQueueSize = 9;
    player.accept([packet(60_000n)]);
    assert.equal(decoder!.resets, 1);
    assert.ok(sources[2]!.stopped);
    player.reset();
    assert.ok(sources.every((source) => source.stopped && source.disconnected));
    player.accept([packet(0n)]);
    assert.equal(sources.length, 5);
    player.close();
    player.close();
    assert.equal(contextCloses, 1);
    assert.equal(decoder!.state, "closed");
    assert.ok(gainDisconnected);
    assert.ok(sources.every((source) => source.stopped && source.disconnected));
    const closedCount = dataCloses;
    decoder!.output(80_000);
    assert.equal(dataCloses, closedCount + 1);
    assert.equal(sources.length, 5);
    assert.deepEqual(errors, []);
  } finally {
    globalThis.AudioDecoder = originalDecoder;
    globalThis.EncodedAudioChunk = originalChunk;
  }
});

test("cancelling unmute closes an audio context while browser resume is pending", async () => {
  const originalContext = globalThis.AudioContext;
  const originalDecoder = globalThis.AudioDecoder;
  let closes = 0;
  class PendingContext {
    state = "suspended";
    resume() {
      return new Promise<void>(() => {});
    }
    close() {
      closes++;
      this.state = "closed";
      return Promise.resolve();
    }
  }
  try {
    globalThis.AudioContext = PendingContext as unknown as typeof AudioContext;
    globalThis.AudioDecoder = class {} as unknown as typeof AudioDecoder;
    const abort = new AbortController();
    const pending = PovAudioPlayer.create(0.8, () => {}, abort.signal);
    abort.abort();
    await assert.rejects(pending, (error) => error === abort.signal.reason);
    assert.equal(closes, 1);
  } finally {
    globalThis.AudioContext = originalContext;
    globalThis.AudioDecoder = originalDecoder;
  }
});
