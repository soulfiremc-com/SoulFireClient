import { Schema } from "effect";

export function createInstanceNameSchema(messages: {
  required: string;
  max: string;
  singleLine: string;
}) {
  return Schema.Trim.check(
    Schema.isMinLength(1, { message: messages.required }),
  )
    .check(Schema.isMaxLength(32, { message: messages.max }))
    .check(
      Schema.makeFilter(
        (value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) || messages.singleLine,
      ),
    );
}

export function getDuplicateInstanceName(name: string) {
  const suffix = " Copy";
  let base = "";
  for (const character of name.trim()) {
    if (base.length + character.length + suffix.length > 32) break;
    base += character;
  }
  return base.trimEnd() ? `${base.trimEnd()}${suffix}` : suffix.trim();
}
