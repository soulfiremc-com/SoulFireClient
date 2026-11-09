import { fromJson, type JsonValue, toJson } from "@bufbuild/protobuf";
import { type Value, ValueSchema } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import { Effect, Stream } from "effect";

export function parseJsonValue(value: string): JsonValue | undefined {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return undefined;
  }
}

export function jsonToValue(json: JsonValue): Value {
  return fromJson(ValueSchema, json);
}

export function valueToJson(value: Value): JsonValue {
  return toJson(ValueSchema, value);
}

export async function observeServerStream<T>(
  stream: Stream.Stream<T, ConnectError>,
  handlers: {
    onMessage?: (message: T) => void | Promise<void>;
    onError?: (error: unknown) => void | Promise<void>;
    onComplete?: () => void | Promise<void>;
  },
): Promise<void> {
  try {
    await Effect.runPromise(
      stream.pipe(
        Stream.runForEach((message) =>
          Effect.tryPromise({
            try: async () => handlers.onMessage?.(message),
            catch: (error) => error,
          }),
        ),
      ),
    );
    await handlers.onComplete?.();
  } catch (error) {
    if (ConnectError.from(error).code === Code.Canceled) {
      return;
    }
    await handlers.onError?.(error);
  }
}
