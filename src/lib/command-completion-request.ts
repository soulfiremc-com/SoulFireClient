import { Effect } from "effect";
import { Atom } from "effect/reactivity";
import type { CommandCompletion } from "@/generated/soulfire/command_pb";

export interface CommandCompletionRequest {
  /** Wait this long before the request so fast typing sends only one. */
  delayMs: number;
  load: Effect.Effect<CommandCompletion[], unknown>;
  onSuggestions: (suggestions: CommandCompletion[]) => void;
  onFailure: (error: unknown) => void;
}

/**
 * Runs one completion request at a time. A new request or `Atom.Interrupt`
 * stops the previous one, so a late reply or failure never reaches the
 * prompt. Unmounting the atom stops the running request.
 */
export function makeCommandCompletionAtom() {
  return Atom.fn((request: CommandCompletionRequest) =>
    request.load.pipe(
      Effect.delay(request.delayMs),
      Effect.match({
        onSuccess: request.onSuggestions,
        onFailure: request.onFailure,
      }),
    ),
  ).pipe(Atom.setIdleTTL(0));
}
