import { useForm } from "@tanstack/react-form";
import {
  ArrowLeftIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
  MailIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ConnectionFailure } from "@/components/launcher/connection-failure.tsx";
import { requestEmailCode } from "@/components/launcher/email-login.ts";
import type {
  AuthFlowData,
  LoginFunction,
  LoginType,
} from "@/components/launcher/launcher-types.ts";
import { withDefaultServerScheme } from "@/components/launcher/server-address.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useServerConnection } from "@/hooks/use-server-connection";
import { emailFormSchema, tokenFormSchema } from "@/lib/login-validation";
import { toFormSchema } from "@/lib/form-validation";
import { isOneOf } from "@/lib/is-one-of";
import { normalizeServerAddress } from "@/lib/server-connection.ts";

const SERVER_ADDRESS_KEY = "form-server-address";
const SERVER_EMAIL_KEY = "form-server-email";
const DEDICATED_TYPE_KEY = "form-dedicated-type";

const DEDICATED_TYPES = ["email", "token"] as const;
type DedicatedType = (typeof DEDICATED_TYPES)[number];

/** The SoulFire server address, shared by the email and token forms. */
function ServerAddressField(props: {
  name: string;
  value: string;
  errors: NonNullable<ComponentProps<typeof FieldError>["errors"]>;
  invalid: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useTranslation("login");
  const change = (value: string) => {
    props.onChange(value);
    localStorage.setItem(SERVER_ADDRESS_KEY, value);
  };
  return (
    <Field data-invalid={props.invalid}>
      <FieldLabel htmlFor={props.name}>
        {t("dedicated.form.address.title")}
      </FieldLabel>
      <Input
        id={props.name}
        name={props.name}
        autoFocus
        type="url"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        autoCapitalize="off"
        placeholder={t("dedicated.form.address.placeholder")}
        value={props.value}
        onBlur={() => {
          change(withDefaultServerScheme(props.value));
          props.onBlur();
        }}
        onChange={(e) => {
          change(e.target.value);
        }}
        aria-invalid={props.invalid}
      />
      <FieldDescription>
        {t("dedicated.form.address.description")}
      </FieldDescription>
      {props.invalid && <FieldError errors={props.errors} />}
    </Field>
  );
}

/** The card shared by the email and token forms. */
function DedicatedCard(props: {
  type: DedicatedType;
  submitting: boolean;
  onBack: () => void;
  onTypeChange: (type: DedicatedType) => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("login");
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {t("connect.dedicated.title")}
          </CardTitle>
          <CardDescription>{t("dedicated.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {props.children}
        </CardContent>
        <CardFooter className="flex flex-col gap-2 max-md:items-stretch md:flex-row">
          <div className="flex grow flex-col justify-between gap-2 max-md:items-stretch md:flex-row">
            <Button variant="outline" type="button" onClick={props.onBack}>
              <ArrowLeftIcon data-icon="inline-start" />
              {t("dedicated.form.back")}
            </Button>
            <ToggleGroup
              value={[props.type]}
              onValueChange={(value) => {
                const nextValue = value[0];
                if (
                  isOneOf(nextValue, DEDICATED_TYPES) &&
                  nextValue !== props.type
                ) {
                  props.onTypeChange(nextValue);
                }
              }}
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
            >
              <ToggleGroupItem value="email" className="flex-1 md:flex-none">
                <MailIcon data-icon="inline-start" />
                {t("dedicated.form.useEmail")}
              </ToggleGroupItem>
              <ToggleGroupItem value="token" className="flex-1 md:flex-none">
                <KeyRoundIcon data-icon="inline-start" />
                {t("dedicated.form.useToken")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Button
            type="submit"
            disabled={props.submitting}
            aria-busy={props.submitting}
          >
            {props.submitting ? (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <LogInIcon data-icon="inline-start" />
            )}
            {t(
              props.submitting ? "connection.checking" : "dedicated.form.login",
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export function DedicatedMenu(props: {
  redirectWithCredentials: LoginFunction;
  setLoginType: (type: LoginType) => void;
  setAuthFlowData: (data: AuthFlowData) => void;
}) {
  const [dedicatedType, setDedicatedType] = useState<DedicatedType>(() =>
    localStorage.getItem(DEDICATED_TYPE_KEY) === "token" ? "token" : "email",
  );
  const changeType = (type: DedicatedType) => {
    localStorage.setItem(DEDICATED_TYPE_KEY, type);
    setDedicatedType(type);
  };
  const back = () => {
    props.setLoginType(null);
  };

  return dedicatedType === "email" ? (
    <EmailForm
      onBack={back}
      onTypeChange={changeType}
      onCodeSent={(data) => {
        props.setAuthFlowData(data);
        props.setLoginType("EMAIL_CODE");
      }}
    />
  ) : (
    <TokenForm
      onBack={back}
      onTypeChange={changeType}
      redirectWithCredentials={props.redirectWithCredentials}
    />
  );
}

function EmailForm(props: {
  onBack: () => void;
  onTypeChange: (type: DedicatedType) => void;
  onCodeSent: (data: AuthFlowData) => void;
}) {
  const { t } = useTranslation("login");
  const [loginError, setLoginError] = useState<unknown>(null);
  // Leaving the form cancels its request, so a late reply cannot open the
  // code step after the user went back or switched to a token.
  const pendingLogin = useRef<AbortController | null>(null);
  useEffect(() => () => pendingLogin.current?.abort(), []);
  const form = useForm({
    defaultValues: {
      address: localStorage.getItem(SERVER_ADDRESS_KEY) ?? "",
      email: localStorage.getItem(SERVER_EMAIL_KEY) ?? "",
    },
    validators: {
      onSubmit: toFormSchema(emailFormSchema),
    },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      setLoginError(null);
      const controller = new AbortController();
      pendingLogin.current = controller;
      try {
        // Store the same canonical address as a token login does.
        const address = normalizeServerAddress(value.address);
        const flowToken = await requestEmailCode(
          address,
          email,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        props.onCodeSent({ email, flowToken, address, sentAt: Date.now() });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setLoginError(error);
      } finally {
        if (pendingLogin.current === controller) pendingLogin.current = null;
      }
    },
  });

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <DedicatedCard
          type="email"
          submitting={isSubmitting}
          onBack={props.onBack}
          onTypeChange={props.onTypeChange}
          onSubmit={() => {
            form.setFieldValue(
              "address",
              withDefaultServerScheme(form.getFieldValue("address")),
            );
            void form.handleSubmit();
          }}
        >
          <form.Field name="address">
            {(field) => (
              <ServerAddressField
                name={field.name}
                value={field.state.value}
                errors={field.state.meta.errors}
                invalid={
                  field.state.meta.isTouched && !field.state.meta.isValid
                }
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("dedicated.form.email.title")}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    placeholder={t("dedicated.form.email.placeholder")}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      localStorage.setItem(SERVER_EMAIL_KEY, e.target.value);
                    }}
                    aria-invalid={isInvalid}
                  />
                  <FieldDescription>
                    {t("dedicated.form.email.description")}
                  </FieldDescription>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <ConnectionFailure error={loginError} method="email" />
        </DedicatedCard>
      )}
    </form.Subscribe>
  );
}

function TokenForm(props: {
  onBack: () => void;
  onTypeChange: (type: DedicatedType) => void;
  redirectWithCredentials: LoginFunction;
}) {
  const { t } = useTranslation("login");
  const connection = useServerConnection((address, token) =>
    props.redirectWithCredentials("dedicated", address, token),
  );
  const form = useForm({
    defaultValues: {
      address: localStorage.getItem(SERVER_ADDRESS_KEY) ?? "",
      // The token stays in form state only, so it is never written to disk.
      token: "",
    },
    validators: {
      onSubmit: toFormSchema(tokenFormSchema),
    },
    onSubmit: async ({ value }) => {
      await connection.connect(value.address.trim(), value.token.trim());
    },
  });

  return (
    <DedicatedCard
      type="token"
      submitting={connection.connecting}
      onBack={props.onBack}
      onTypeChange={props.onTypeChange}
      onSubmit={() => {
        form.setFieldValue(
          "address",
          withDefaultServerScheme(form.getFieldValue("address")),
        );
        void form.handleSubmit();
      }}
    >
      <form.Field name="address">
        {(field) => (
          <ServerAddressField
            name={field.name}
            value={field.state.value}
            errors={field.state.meta.errors}
            invalid={field.state.meta.isTouched && !field.state.meta.isValid}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name="token">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                {t("dedicated.form.token.title")}
              </FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="off"
                placeholder={t("dedicated.form.token.placeholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                }}
                aria-invalid={isInvalid}
              />
              <FieldDescription>
                {t("dedicated.form.token.description")}
              </FieldDescription>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          );
        }}
      </form.Field>
      <ConnectionFailure error={connection.error} method="token" />
    </DedicatedCard>
  );
}
