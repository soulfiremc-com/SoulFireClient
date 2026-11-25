import { Code, ConnectError } from "@connectrpc/connect";
import { Cause, Effect, Stream } from "effect";
import { Atom } from "effect/reactivity";

/** Waits this long after the last graph edit before validating. */
export const SCRIPT_VALIDATION_DELAY_MS = 500;

export interface ScriptActivation<A> {
  events: Stream.Stream<A, unknown>;
  onEvent: (event: A) => void;
  onError: (error: unknown) => void;
  onComplete: () => void;
}

/**
 * Follows one activation stream at a time. A new activation or
 * `Atom.Interrupt` stops the previous stream without calling its handlers,
 * and so does unmounting the atom. A stream the server cancels ends quietly.
 */
export function makeScriptActivationAtom<A>() {
  return Atom.fn((activation: ScriptActivation<A>) =>
    activation.events.pipe(
      // A handler that throws ends the stream like a stream failure.
      Stream.runForEach((event) =>
        Effect.sync(() => {
          activation.onEvent(event);
        }),
      ),
      Effect.matchCause({
        onSuccess: activation.onComplete,
        onFailure: (cause) => {
          const error = Cause.squash(cause);
          if (ConnectError.from(error).code !== Code.Canceled)
            activation.onError(error);
        },
      }),
    ),
  ).pipe(Atom.setIdleTTL(0));
}

export interface ScriptValidation<A> {
  validate: Effect.Effect<A, unknown>;
  onDiagnostics: (diagnostics: A) => void;
}

/**
 * Validates the latest graph after a pause in editing. A newer graph or
 * `Atom.Interrupt` stops the previous validation. Validation is best-effort,
 * so a failure leaves the last successful diagnostics in place.
 */
export function makeScriptValidationAtom<A>() {
  return Atom.fn((validation: ScriptValidation<A>) =>
    validation.validate.pipe(
      Effect.delay(SCRIPT_VALIDATION_DELAY_MS),
      Effect.tap((diagnostics) =>
        Effect.sync(() => {
          validation.onDiagnostics(diagnostics);
        }),
      ),
      Effect.ignore,
    ),
  ).pipe(Atom.setIdleTTL(0));
}
