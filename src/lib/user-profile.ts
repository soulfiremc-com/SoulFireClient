import { z } from "zod";

export function createUsernameSchema(messages: {
  min: string;
  max: string;
  pattern: string;
}) {
  return z
    .string()
    .min(3, messages.min)
    .max(32, messages.max)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, messages.pattern);
}

export const userEmailSchema = z.email().max(255);
