import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { PovFrameSchema } from "@/generated/soulfire/pov_pb";
import { PovVideoDecoder } from "./pov-video-decoder";

const chunk = (sequence: number, keyFrame = false, width = 640) =>
  create(PovFrameSchema, {
    sequence: BigInt(sequence),
    timestampUs: BigInt(sequence * 16_667),
    keyFrame,
    width,
    height: 360,
    codec: "avc1.42C02A",
    data: new Uint8Array([1]),
  });
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("decoder recovers at keyframes after backlog and releases stale output after reset", async () => {
  const originalDecoder = globalThis.VideoDecoder;
  const originalChunk = globalThis.EncodedVideoChunk;
  const decoders: FakeDecoder[] = [];
  class FakeDecoder {
    static async isConfigSupported() {
      return { supported: true };
    }
    state = "unconfigured";
    decodeQueueSize = 0;
    resets = 0;
    readonly callbacks: VideoDecoderInit;

    constructor(callbacks: VideoDecoderInit) {
      this.callbacks = callbacks;

      decoders.push(this);
    }
    configure() {
      this.state = "configured";
    }
    close() {
      this.state = "closed";
    }
    reset() {
      this.resets++;
      this.decodeQueueSize = 0;
      this.state = "unconfigured";
    }
    decode() {
      this.decodeQueueSize++;
    }
  }
  Object.defineProperty(globalThis, "VideoDecoder", {
    configurable: true,
    writable: true,
    value: FakeDecoder,
  });
  Object.defineProperty(globalThis, "EncodedVideoChunk", {
    configurable: true,
    writable: true,
    value: class {
      readonly init: EncodedVideoChunkInit;

      constructor(init: EncodedVideoChunkInit) {
        this.init = init;
      }
    },
  });
  let requestedKeys = 0;
  let displayed = 0;
  let closedFrames = 0;
  const errors: Error[] = [];
  const decoder = new PovVideoDecoder(
    () => {
      displayed++;
    },
    () => {
      requestedKeys++;
    },
    (error) => {
      errors.push(error);
    },
  );
  try {
    decoder.accept(chunk(1, true));
    await settle();
    decoder.accept(chunk(2));
    assert.equal(
      decoders[0]?.decodeQueueSize,
      0,
      "Discard dependent frames until a fresh keyframe",
    );
    decoder.accept(chunk(3, true));
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    decoders[0].callbacks.output({
      timestamp: 3 * 16_667,
      close() {
        closedFrames++;
      },
    } as VideoFrame);
    assert.equal(displayed, 1);
    assert.equal(closedFrames, 1);
    const keysBeforeBacklog = requestedKeys;
    decoder.accept(chunk(4));
    decoder.accept(chunk(5));
    decoder.accept(chunk(6));
    decoder.accept(chunk(7));
    assert.equal(decoders[0].resets, 1, "Reset a decoder that falls behind");
    assert.equal(
      decoders[0].state,
      "configured",
      "Keep the configured decoder so the next keyframe can decode at once",
    );
    assert.equal(decoders.length, 1);
    assert.equal(requestedKeys, keysBeforeBacklog + 1);
    decoder.accept(chunk(9));
    assert.equal(
      requestedKeys,
      keysBeforeBacklog + 1,
      "Throttle keyframe requests while the recovery keyframe is on its way",
    );
    decoder.accept(chunk(10, true));
    assert.equal(decoders[0].decodeQueueSize, 1, "Resume at the next keyframe");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double implements only the members this test uses
    decoders[0].callbacks.output({
      timestamp: 4 * 16_667,
      close() {
        closedFrames++;
      },
    } as VideoFrame);
    assert.equal(displayed, 1, "Never display stale output after reset");
    assert.equal(closedFrames, 2);
    const keysBeforeGap = requestedKeys;
    decoder.accept(chunk(15, true));
    assert.equal(decoders[0].resets, 2, "Reset after a sequence gap");
    assert.equal(
      decoders[0].decodeQueueSize,
      1,
      "Decode the keyframe that follows a gap",
    );
    assert.equal(
      requestedKeys,
      keysBeforeGap,
      "Do not ask for another keyframe when one already arrived",
    );
    decoder.accept(chunk(16));
    assert.equal(decoders[0].decodeQueueSize, 2, "Continue after the keyframe");
    const keysBeforeResize = requestedKeys;
    decoder.accept(chunk(17, true, 800));
    assert.equal(decoders.length, 1, "Reuse the decoder after a resize");
    assert.equal(decoders[0].resets, 3);
    assert.equal(
      decoders[0].decodeQueueSize,
      1,
      "Decode the keyframe that announced new dimensions",
    );
    assert.equal(requestedKeys, keysBeforeResize);
    decoder.accept(chunk(18, false, 800));
    assert.equal(decoders[0].decodeQueueSize, 2);
    decoder.reset();
    decoder.accept(chunk(1, true, 800));
    assert.equal(
      decoders[1]?.decodeQueueSize,
      1,
      "Configure a new decoder at once after a reconnect",
    );
    assert.deepEqual(errors, []);
  } finally {
    decoder.close();
    Object.defineProperty(globalThis, "VideoDecoder", {
      configurable: true,
      writable: true,
      value: originalDecoder,
    });
    Object.defineProperty(globalThis, "EncodedVideoChunk", {
      configurable: true,
      writable: true,
      value: originalChunk,
    });
  }
});
