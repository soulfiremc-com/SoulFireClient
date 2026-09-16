import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import { PovFrameSchema } from "@/generated/soulfire/pov_pb";
import { PovVideoDecoder } from "./pov-video-decoder";

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
    constructor(readonly callbacks: VideoDecoderInit) {
      decoders.push(this);
    }
    configure() {
      this.state = "configured";
    }
    close() {
      this.state = "closed";
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
      constructor(readonly init: EncodedVideoChunkInit) {}
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
    (error) => errors.push(error),
  );
  const chunk = (sequence: number, keyFrame = false, width = 640) =>
    create(PovFrameSchema, {
      sequence: BigInt(sequence),
      timestampUs: BigInt(sequence * 16667),
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
  try {
    decoder.accept(chunk(1, true));
    await settle();
    decoder.accept(chunk(2));
    assert.equal(
      decoders[0].decodeQueueSize,
      0,
      "Discard dependent frames until a fresh keyframe",
    );
    decoder.accept(chunk(3, true));
    decoders[0].callbacks.output({
      timestamp: 3 * 16667,
      close() {
        closedFrames++;
      },
    } as VideoFrame);
    assert.equal(displayed, 1);
    assert.equal(closedFrames, 1);
    decoder.accept(chunk(4));
    decoder.accept(chunk(5));
    decoder.accept(chunk(6));
    decoder.accept(chunk(7));
    assert.equal(
      decoders[0].state,
      "closed",
      "Reset a decoder that falls behind",
    );
    assert.ok(requestedKeys > 0);
    decoders[0].callbacks.output({
      timestamp: 4 * 16667,
      close() {
        closedFrames++;
      },
    } as VideoFrame);
    assert.equal(displayed, 1, "Never display stale output after reset");
    assert.equal(closedFrames, 2);
    decoder.accept(chunk(8, true, 800));
    await settle();
    decoder.accept(chunk(9, true, 800));
    assert.equal(
      decoders[1].decodeQueueSize,
      1,
      "Resume with new dimensions and a keyframe",
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
