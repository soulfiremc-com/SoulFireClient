import { Schema } from "effect";
import { emailSchema, jwtSchema, urlSchema } from "./form-validation";
import { isSupportedServerUrl } from "./server-connection";

const serverAddressSchema = Schema.Trim.pipe(
  Schema.decodeTo(
    urlSchema.check(
      Schema.makeFilter(
        // Unparsable input already fails the URL check above.
        (value) =>
          !URL.canParse(value) ||
          isSupportedServerUrl(value) ||
          "validation:serverUrl",
      ),
    ),
  ),
);

export const emailFormSchema = Schema.Struct({
  address: serverAddressSchema,
  email: emailSchema,
});

export const tokenFormSchema = Schema.Struct({
  address: serverAddressSchema,
  token: Schema.Trim.pipe(Schema.decodeTo(jwtSchema)),
});
