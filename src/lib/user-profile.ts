import { emailSchema } from "./form-validation";
import { Schema } from "effect";

export function createUsernameSchema(messages: {
  min: string;
  max: string;
  pattern: string;
}) {
  return Schema.String.check(Schema.isMinLength(3, { message: messages.min }))
    .check(Schema.isMaxLength(32, { message: messages.max }))
    .check(
      Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
        message: messages.pattern,
      }),
    );
}

export const userEmailSchema = emailSchema.check(
  Schema.isMaxLength(255, { message: "validation:emailTooLong" }),
);
