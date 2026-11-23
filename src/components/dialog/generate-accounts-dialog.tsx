import { formatNumber } from "@/lib/format.ts";
import { toFormSchema } from "@/lib/form-validation";
import {
  formatAccountName,
  MAX_GENERATED_ACCOUNTS,
  parseAccountAmount,
  resolveNameFormat,
} from "@/lib/generate-accounts.ts";
import { Schema } from "effect";

import { useForm } from "@tanstack/react-form";
import { TriangleAlertIcon } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import { ConfirmDialog } from "@/components/dialog/confirm-dialog.tsx";
import { TextInfoButton } from "@/components/info-buttons.tsx";
import { useCredentialLoginStream } from "@/hooks/use-credential-login-stream.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import type { GenerateAccountsMode, ProfileAccount } from "@/lib/types.ts";
import { isOneOf } from "@/lib/is-one-of";
import { GENERATE_ACCOUNTS_MODES } from "@/lib/types";

const DEFAULT_GENERATE_MODE: GenerateAccountsMode = "IGNORE_EXISTING";

export interface GenerateAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (
    accounts: ProfileAccount[],
    mode: GenerateAccountsMode,
  ) => Promise<void>;
  existingUsernames: Set<string>;
  /** Extra options for the success toast, such as a next step action. */
  successToast?: ExternalToast;
}

type GenerationPhase = "generating" | "saving";

interface GenerationJob {
  cancel: () => void;
  toastId: string | number;
  phase: GenerationPhase;
}

export default function GenerateAccountsDialog({
  open,
  onOpenChange,
  onGenerate,
  existingUsernames,
  successToast,
}: GenerateAccountsDialogProps) {
  const { t } = useTranslation("instance");
  const startCredentialLogin = useCredentialLoginStream();
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const [phase, setPhase] = useState<GenerationPhase | "idle">("idle");
  const [pendingReplaceAll, setPendingReplaceAll] = useState<{
    amount: number;
    nameFormat: string;
    mode: GenerateAccountsMode;
  } | null>(null);
  const activeJob = useRef<GenerationJob | null>(null);
  const cancelGeneration = useCallback((job = activeJob.current) => {
    if (!job || activeJob.current !== job) return;
    activeJob.current = null;
    job.cancel();
    toast.dismiss(job.toastId);
    setPhase("idle");
  }, []);

  useEffect(
    () => () => {
      cancelGeneration();
    },
    [instanceInfo.id, cancelGeneration],
  );
  useEffect(() => {
    if (!open && activeJob.current?.phase !== "saving") cancelGeneration();
  }, [open, cancelGeneration]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && activeJob.current?.phase !== "saving") cancelGeneration();
    onOpenChange(nextOpen);
  };

  const formSchema = Schema.Struct({
    amount: Schema.String.check(
      Schema.makeFilter(
        (value) =>
          parseAccountAmount(value) !== null ||
          t("account.generate.amountOutOfRange", {
            max: formatNumber(MAX_GENERATED_ACCOUNTS),
          }),
      ),
    ),
    nameFormat: Schema.String.check(
      Schema.makeFilter(
        (value) =>
          resolveNameFormat(value) !== null ||
          t("account.generate.missingNameFormat"),
      ),
    ),
    mode: Schema.Literals([
      "IGNORE_EXISTING",
      "REPLACE_EXISTING",
      "REPLACE_ALL",
    ])
      .annotate({ message: "validation:generationMode" })
      .annotateKey({ messageMissingKey: "validation:generationMode" }),
  });

  const handleGenerate = (value: {
    amount: number;
    nameFormat: string;
    mode: GenerateAccountsMode;
  }) => {
    if (!open || activeJob.current) return;

    // Generate usernames based on format
    const usernames: string[] = [];
    for (let i = 1; i <= value.amount; i++) {
      const username = formatAccountName(value.nameFormat, i);
      // Skip usernames that already exist only in IGNORE_EXISTING mode
      if (value.mode === "IGNORE_EXISTING" && existingUsernames.has(username)) {
        continue;
      }
      usernames.push(username);
    }

    if (usernames.length === 0) {
      toast.error(t("account.generate.allExist"));
      return;
    }

    const job: GenerationJob = {
      cancel: () => {},
      toastId: "",
      phase: "generating",
    };
    const handle = startCredentialLogin({
      instanceId: instanceInfo.id,
      service: AccountTypeCredentials.OFFLINE,
      payload: usernames,
      progressMessage: (progress) =>
        t("account.generate.progress", { ...progress }),
      onSettled: async ({ outcome, accounts, error }, toastId) => {
        // Closing the dialog already canceled this job.
        if (activeJob.current !== job) return;
        const fail = (message: string) => {
          activeJob.current = null;
          setPhase("idle");
          toast.error(message, { id: toastId, cancel: undefined });
        };
        // Offline accounts are free to generate again, and saving part of a
        // replace-all run would remove the other accounts. Only a complete
        // run is saved.
        if (outcome === "cancelled") {
          activeJob.current = null;
          setPhase("idle");
          return;
        }
        if (outcome === "error") {
          console.error(error);
          fail(t("account.generate.error"));
          return;
        }
        if (accounts.length === 0) {
          fail(t("account.generate.allFailed"));
          return;
        }

        job.phase = "saving";
        setPhase("saving");
        try {
          await onGenerate(accounts, value.mode);
        } catch (saveError) {
          console.error(saveError);
          if (activeJob.current === job) fail(t("account.generate.error"));
          return;
        }
        if (activeJob.current !== job) return;
        activeJob.current = null;
        setPhase("idle");
        onOpenChange(false);
        toast.success(
          t("account.generate.success", { count: accounts.length }),
          { ...successToast, id: toastId, cancel: undefined },
        );
      },
    });
    if (handle === null) {
      toast.info(t("account.import.demo"));
      return;
    }
    job.cancel = handle.cancel;
    job.toastId = handle.toastId;
    activeJob.current = job;
    setPhase("generating");
  };

  const form = useForm({
    defaultValues: {
      amount: "1",
      nameFormat: "Bot_%d",
      mode: DEFAULT_GENERATE_MODE,
    },
    validators: {
      onSubmit: toFormSchema(formSchema),
    },
    onSubmit: ({ value }) => {
      const amount = parseAccountAmount(value.amount);
      const nameFormat = resolveNameFormat(value.nameFormat);
      if (amount === null || nameFormat === null) return;
      const request = { ...value, amount, nameFormat };
      // Replacing all accounts also removes imported accounts that cannot be
      // generated again, so ask first.
      if (
        request.mode === "REPLACE_ALL" &&
        instanceInfo.profile.accounts.length > 0
      ) {
        setPendingReplaceAll(request);
        return;
      }
      handleGenerate(request);
    },
  });

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <CredenzaHeader>
            <CredenzaTitle>{t("account.generate.title")}</CredenzaTitle>
            <CredenzaDescription>
              {t("account.generate.description")}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="flex flex-col gap-4 pb-4 md:pb-0">
            <form.Field name="amount">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("account.generate.amount")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_GENERATED_ACCOUNTS}
                      step={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      aria-invalid={isInvalid}
                      aria-describedby={
                        isInvalid ? `${field.name}-error` : undefined
                      }
                    />
                    {isInvalid && (
                      <FieldError
                        id={`${field.name}-error`}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="nameFormat">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {t("account.generate.nameFormat")}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      placeholder="Bot_%d"
                      aria-invalid={isInvalid}
                      aria-describedby={
                        isInvalid
                          ? `${field.name}-description ${field.name}-error`
                          : `${field.name}-description`
                      }
                    />
                    <FieldDescription id={`${field.name}-description`}>
                      {t("account.generate.nameFormatHelp")}
                      <form.Subscribe selector={(state) => state.values.amount}>
                        {(amountValue) => (
                          <NamePreview
                            nameFormat={field.state.value}
                            amount={parseAccountAmount(amountValue)}
                          />
                        )}
                      </form.Subscribe>
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError
                        id={`${field.name}-error`}
                        errors={field.state.meta.errors}
                      />
                    )}
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="mode">
              {(field) => {
                const modeItems = [
                  {
                    label: t("account.generate.modeIgnoreExisting"),
                    value: "IGNORE_EXISTING",
                  },
                  {
                    label: t("account.generate.modeReplaceExisting"),
                    value: "REPLACE_EXISTING",
                  },
                  {
                    label: t("account.generate.modeReplaceAll"),
                    value: "REPLACE_ALL",
                  },
                ];

                return (
                  <Field>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor={field.name}>
                        {t("account.generate.mode")}
                      </FieldLabel>
                      <TextInfoButton value={t("account.generate.modeHelp")} />
                    </div>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (isOneOf(value, GENERATE_ACCOUNTS_MODES))
                          field.handleChange(value);
                      }}
                      items={modeItems}
                    >
                      <SelectTrigger id={field.name} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {t("account.generate.mode")}
                          </SelectLabel>
                          {modeItems.map((mode) => (
                            <SelectItem key={mode.value} value={mode.value}>
                              {mode.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                );
              }}
            </form.Field>
          </CredenzaBody>
          <CredenzaFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              {t(phase === "saving" ? "common:close" : "common:cancel")}
            </Button>
            <Button type="submit" disabled={phase !== "idle"}>
              {phase !== "idle"
                ? t("account.generate.generating")
                : t("account.generate.submit")}
            </Button>
          </CredenzaFooter>
        </form>
        <ConfirmDialog
          open={pendingReplaceAll !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingReplaceAll(null);
          }}
          icon={<TriangleAlertIcon />}
          title={t("account.generate.replaceAllDialog.title", {
            count: instanceInfo.profile.accounts.length,
          })}
          description={t("account.generate.replaceAllDialog.description")}
          confirmLabel={t("account.generate.replaceAllDialog.confirm")}
          onConfirm={() => {
            if (pendingReplaceAll !== null) handleGenerate(pendingReplaceAll);
          }}
        />
      </CredenzaContent>
    </Credenza>
  );
}

function NamePreview({
  nameFormat,
  amount,
}: {
  nameFormat: string;
  amount: number | null;
}) {
  const { t } = useTranslation("instance");
  const resolved = resolveNameFormat(nameFormat);
  if (resolved === null || amount === null) return null;
  return (
    <>
      {" "}
      {t("account.generate.preview", {
        count: amount,
        first: formatAccountName(resolved, 1),
        last: formatAccountName(resolved, amount),
      })}
    </>
  );
}
