import { Data } from "effect";

export class CastError extends Data.TaggedError("CastError")<{
  readonly message: string;
  readonly retryable: boolean;
}> {}

export const castError = (message: string, retryable = true) =>
  new CastError({ message, retryable });
