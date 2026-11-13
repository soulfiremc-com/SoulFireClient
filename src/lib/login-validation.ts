import { Schema } from "effect";
import { emailSchema, jwtSchema, urlSchema } from "./form-validation";

export const emailFormSchema = Schema.Struct({
  address: Schema.Trim.pipe(Schema.decodeTo(urlSchema)),
  email: emailSchema,
});

export const tokenFormSchema = Schema.Struct({
  address: Schema.Trim.pipe(Schema.decodeTo(urlSchema)),
  token: Schema.Trim.pipe(Schema.decodeTo(jwtSchema)),
});

export const integratedServerFormSchema = Schema.Struct({
  customJarId: Schema.String,
  jarSource: Schema.Literals(["official", "custom"])
    .annotate({ message: "validation:jarSource" })
    .annotateKey({ messageMissingKey: "validation:jarSource" }),
  jvmArgs: Schema.String,
});

export const mobileIntegratedServerFormSchema = Schema.Struct({
  token: Schema.Trim.pipe(Schema.decodeTo(jwtSchema)),
});
