import { Schema, SchemaIssue } from "effect";
import i18n from "i18next";
import type { StandardSchemaV1 } from "effect/StandardSchema";

// The validation catalogs preserve the former locale wording. See public/licenses/zod-validation-messages.txt.
function message(key: string) {
  return i18n.t(`validation:${key}`);
}

function inputKind(input: unknown) {
  if (input === null) return "null";
  if (Array.isArray(input)) return "array";
  if (typeof input === "number" && Number.isNaN(input)) return "nan";
  if (typeof input === "number" && !Number.isFinite(input)) return "infinity";
  return typeof input;
}

const leafHook: SchemaIssue.LeafHook = (issue) => {
  if (issue._tag === "MissingKey" && !issue.annotations?.messageMissingKey) {
    return message("string.undefined");
  }
  if (issue._tag === "InvalidType" && !issue.ast.annotations?.message) {
    const expected =
      issue.ast._tag === "String"
        ? "string"
        : issue.ast._tag === "Number"
          ? "number"
          : issue.ast._tag === "Objects"
            ? "object"
            : undefined;
    if (expected) return message(`${expected}.${inputKind(issue.input)}`);
  }
  return SchemaIssue.defaultLeafHook(issue);
};

/** Format native Schema issues for forms using the current application language. */
export function toFormSchema<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
) {
  const standard = Schema.toStandardSchemaV1(schema, {
    leafHook,
    parseOptions: { reportInput: true },
  });
  const validate = standard["~standard"].validate;
  const localize = (
    result: StandardSchemaV1.Result<S["Type"]>,
  ): StandardSchemaV1.Result<S["Type"]> => {
    if (!result.issues) return result;
    return {
      issues: result.issues.map((issue) => ({
        ...issue,
        message: issue.message.startsWith("validation:")
          ? message(issue.message.slice(11))
          : issue.message,
      })),
    };
  };
  return Object.assign(standard, {
    "~standard": {
      ...standard["~standard"],
      validate: (value: unknown) => {
        const result = validate(value);
        return result instanceof Promise
          ? result.then(localize)
          : localize(result);
      },
    },
  });
}

export const formNumber = Schema.Number.check(
  Schema.makeFilter(
    (value) => Number.isFinite(value) || message(`number.${inputKind(value)}`),
  ),
).annotateKey({ messageMissingKey: "validation:number.undefined" });

export const emailSchema = Schema.String.check(
  Schema.isPattern(
    /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/,
    { message: "validation:email" },
  ),
);

export const urlSchema = Schema.String.check(
  Schema.makeFilter((value) => URL.canParse(value) || message("url")),
);

export const jwtSchema = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const parts = value.split(".");
      if (parts.length !== 3 || !parts[0]) return message("jwt");
      const header = JSON.parse(atob(parts[0]));
      return (
        ((!("typ" in header) || header.typ === "JWT") && !!header.alg) ||
        message("jwt")
      );
    } catch {
      return message("jwt");
    }
  }),
);
