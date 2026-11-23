import { TaggedError as TaggedFailure } from "effect/Schema";
import { Schema } from "effect";

export class CastError extends TaggedFailure<
  CastError,
  { readonly brand: unique symbol }
>()("CastError", {
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}

// Messages that this app creates are codes. The renderer translates them with
// the `cast:errors.<code>` keys and shows other messages, such as socket or
// receiver errors, as they are.
export const castError = (message: string, retryable = true) =>
  CastError.make({ message, retryable });
