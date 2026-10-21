import { z } from "zod";

export function createInstanceNameSchema(messages: {
  required: string;
  max: string;
  singleLine: string;
}) {
  return z
    .string()
    .trim()
    .min(1, messages.required)
    .max(32, messages.max)
    .refine(
      (value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
      messages.singleLine,
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
