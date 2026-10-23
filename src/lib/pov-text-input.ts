import { create } from "@bufbuild/protobuf";
import {
  type PovInputEvent,
  PovInputEvent_Kind as Kind,
  PovInputEventSchema,
} from "@/generated/soulfire/pov_pb";

function keyPress(code: number, modifiers = 0): PovInputEvent[] {
  return [1, 0].map((action) =>
    create(PovInputEventSchema, { kind: Kind.KEY, code, action, modifiers }),
  );
}

// The hidden textarea contains committed input, not the native field's contents.
export function textInputEvents(value: string): PovInputEvent[] {
  const events: PovInputEvent[] = [];
  for (const character of value.replace(/\r\n?/g, "\n")) {
    const code = character.codePointAt(0)!;
    if (character === "\n") events.push(...keyPress(257));
    else if (character === "\t") events.push(...keyPress(258));
    else if (code >= 32 && !(code >= 0xd800 && code <= 0xdfff))
      events.push(create(PovInputEventSchema, { kind: Kind.CHARACTER, code }));
  }
  return events;
}

// Soft keyboards can request deletion without providing a physical key code.
export function textEditEvents(
  event: Pick<InputEvent, "inputType" | "isComposing">,
): PovInputEvent[] {
  if (event.isComposing) return [];
  switch (event.inputType) {
    case "deleteContentBackward":
      return keyPress(259);
    case "deleteContentForward":
      return keyPress(261);
    case "deleteWordBackward":
      return keyPress(259, 2);
    case "deleteWordForward":
      return keyPress(261, 2);
    default:
      return [];
  }
}
