import { beforeAll, expect, test } from "bun:test";
import { FieldApi, FormApi } from "@tanstack/react-form";
import { Schema } from "effect";
import i18n from "i18next";
import en from "../../locales/en-US/validation.json";
import de from "../../locales/de-DE/validation.json";
import fr from "../../locales/fr-FR/validation.json";
import pirate from "../../locales/en-PT/validation.json";
import {
  emailSchema,
  formNumber,
  jwtSchema,
  toFormSchema,
} from "./form-validation";
import {
  emailFormSchema,
  integratedServerFormSchema,
  tokenFormSchema,
} from "./login-validation";
import { createInstanceNameSchema } from "./instance-name";
import { createUsernameSchema, userEmailSchema } from "./user-profile";

beforeAll(async () => {
  await i18n.init({
    lng: "en-US",
    fallbackLng: "en-US",
    load: "currentOnly",
    resources: {
      "en-US": { validation: en },
      "de-DE": { validation: de },
      "fr-FR": { validation: fr },
      "en-PT": { validation: pirate },
    },
  });
});

test("existing validators follow language changes and retain paths for every invalid field", async () => {
  const validator = toFormSchema(emailFormSchema);
  for (const [locale, messages] of [
    ["de-DE", de],
    ["fr-FR", fr],
    ["en-US", en],
  ] as const) {
    await i18n.changeLanguage(locale);
    expect(
      await validator["~standard"].validate({
        address: "invalid",
        email: "invalid",
      }),
    ).toEqual({
      issues: [
        { path: ["address"], message: messages.url },
        { path: ["email"], message: messages.email },
      ],
    });
    expect(
      await toFormSchema(integratedServerFormSchema)["~standard"].validate({
        customJarId: "",
        jarSource: "invalid",
        jvmArgs: "",
      }),
    ).toEqual({
      issues: [{ path: ["jarSource"], message: messages.jarSource }],
    });
  }
});

test("generic type errors, missing fields, bounds, and locale fallbacks preserve their wording", async () => {
  await i18n.changeLanguage("de-DE");
  expect(
    await toFormSchema(
      Schema.Struct({ name: Schema.String, amount: formNumber }),
    )["~standard"].validate({ name: null, amount: Infinity }),
  ).toEqual({
    issues: [
      { path: ["name"], message: de.string.null },
      { path: ["amount"], message: de.number.infinity },
    ],
  });
  expect(
    await toFormSchema(Schema.Struct({ name: Schema.String }))[
      "~standard"
    ].validate({}),
  ).toEqual({ issues: [{ path: ["name"], message: de.string.undefined }] });
  expect(
    await toFormSchema(userEmailSchema)["~standard"].validate(
      `${"a".repeat(250)}@example.com`,
    ),
  ).toEqual({ issues: [{ path: [], message: de.emailTooLong }] });
  await i18n.changeLanguage("en-PT");
  expect(
    await toFormSchema(emailSchema)["~standard"].validate("invalid"),
  ).toEqual({ issues: [{ path: [], message: en.email }] });
  await i18n.changeLanguage("missing-locale");
  expect(
    await toFormSchema(emailSchema)["~standard"].validate("invalid"),
  ).toEqual({ issues: [{ path: [], message: en.email }] });
});

test("decoded submissions retain trimming and existing JWT header acceptance", async () => {
  const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.payload.signature`;
  const input = { address: " https://server.example/ ", token: ` ${token} ` };
  expect(
    await toFormSchema(tokenFormSchema)["~standard"].validate(input),
  ).toEqual({ value: { address: "https://server.example/", token } });
  for (const header of [{}, { alg: "HS256", typ: "other" }, null]) {
    expect(
      (
        await toFormSchema(jwtSchema)["~standard"].validate(
          `${btoa(JSON.stringify(header))}.payload.signature`,
        )
      ).issues,
    ).toBeDefined();
  }
  const instance = createInstanceNameSchema({
    required: "required",
    max: "max",
    singleLine: "single line",
  });
  expect(Schema.decodeSync(instance)("  Farm  ")).toBe("Farm");
  const username = createUsernameSchema({
    min: "minimum",
    max: "maximum",
    pattern: "pattern",
  });
  expect(
    (await toFormSchema(username)["~standard"].validate("ab")).issues?.[0]
      .message,
  ).toBe("minimum");
  expect(
    (await toFormSchema(instance)["~standard"].validate(" \n ")).issues?.[0]
      .message,
  ).toBe("required");
});

test("TanStack Form blocks invalid submissions and retains translated field errors", async () => {
  await i18n.changeLanguage("de-DE");
  const submitted: string[] = [];
  const form = new FormApi({
    defaultValues: { email: "invalid" },
    validators: {
      onSubmit: toFormSchema(Schema.Struct({ email: emailSchema })),
    },
    onSubmit: ({ value }) => {
      submitted.push(value.email);
    },
  });
  const unmount = form.mount();
  const field = new FieldApi({ form, name: "email" });
  const unmountField = field.mount();
  try {
    await form.handleSubmit();
    expect(submitted).toEqual([]);
    expect(form.state.errorMap.onSubmit).toMatchObject({
      email: [{ message: de.email }],
    });
    field.handleChange("user@example.com");
    await form.handleSubmit();
    expect(submitted).toEqual(["user@example.com"]);
  } finally {
    unmountField();
    unmount();
  }
});
