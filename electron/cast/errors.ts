import { TaggedError as TaggedFailure } from "effect/Schema";
import { Schema } from "effect";

export class CastError extends TaggedFailure<
  CastError,
  { readonly brand: unique symbol }
>()("CastError", {
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}

export const castError = (message: string, retryable = true) =>
  new CastError({ message, retryable });
