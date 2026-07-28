import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { type Value, ValueSchema } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";

export function jsonToValue(json: JsonValue): Value {
  return fromJson(ValueSchema, json);
}

export function valueToJson(value: Value): JsonValue {
  return toJson(ValueSchema, value);
}

export async function observeServerStream<T>(
  stream: AsyncIterable<T>,
  handlers: {
    onMessage?: (message: T) => void | Promise<void>;
    onError?: (error: unknown) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
  },
): Promise<void> {
  try {
    for await (const message of stream) {
      await handlers.onMessage?.(message);
    }
    await handlers.onComplete?.();
  } catch (error) {
    if (ConnectError.from(error).code === Code.Canceled) {
      return;
    }
    await handlers.onError?.(error);
  }
}
