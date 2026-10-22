import { createClient } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ExternalToast, toast } from "sonner";
import { z } from "zod";
import { TextInfoButton } from "@/components/info-buttons.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
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
import { MCAuthService } from "@/generated/soulfire/mc-auth_pb";
import { observeServerStream } from "@/lib/protobuf.ts";
import type { GenerateAccountsMode, ProfileAccount } from "@/lib/types.ts";

export type GenerateAccountsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (
    accounts: ProfileAccount[],
    mode: GenerateAccountsMode,
  ) => Promise<void>;
  existingUsernames: Set<string>;
};

type GenerationPhase = "generating" | "saving";

type GenerationJob = {
  controller: AbortController;
  toastId: string | number;
  phase: GenerationPhase;
};

export default function GenerateAccountsDialog({
  open,
  onOpenChange,
  onGenerate,
  existingUsernames,
}: GenerateAccountsDialogProps) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const [phase, setPhase] = useState<GenerationPhase | "idle">("idle");
  const activeJob = useRef<GenerationJob | null>(null);
  const cancelGeneration = useCallback((job = activeJob.current) => {
    if (!job || activeJob.current !== job) return;
    activeJob.current = null;
    job.controller.abort();
    toast.dismiss(job.toastId);
    setPhase("idle");
  }, []);

  useEffect(
    () => () => cancelGeneration(),
    [instanceInfo.id, cancelGeneration],
  );
  useEffect(() => {
    if (!open && activeJob.current?.phase !== "saving") cancelGeneration();
  }, [open, cancelGeneration]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && activeJob.current?.phase !== "saving") cancelGeneration();
    onOpenChange(nextOpen);
  };

  const formSchema = z.object({
    amount: z.number().min(1, t("account.generate.invalidAmount")),
    nameFormat: z
      .string()
      .refine(
        (v) => v.includes("%d"),
        t("account.generate.missingPlaceholder"),
      ),
    mode: z.enum(["IGNORE_EXISTING", "REPLACE_EXISTING", "REPLACE_ALL"]),
  });

  const handleGenerate = (value: z.infer<typeof formSchema>) => {
    if (transport === null || !open || activeJob.current) return;

    // Generate usernames based on format
    const usernames: string[] = [];
    for (let i = 1; i <= value.amount; i++) {
      const username = value.nameFormat.replace("%d", String(i));
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

    const service = createClient(MCAuthService, transport);

    const abortController = new AbortController();
    const loadingData: ExternalToast = {
      cancel: {
        label: t("common:cancel"),
        onClick: () => {
          if (job.phase === "generating") cancelGeneration(job);
        },
      },
    };
    const total = usernames.length;
    let failed = 0;
    let success = 0;
    const accountsToAdd: ProfileAccount[] = [];
    const loadingReport = () =>
      t("account.generate.progress", {
        checked: success + failed,
        total,
        success,
        failed,
      });
    const toastId = toast.loading(loadingReport(), loadingData);
    const job: GenerationJob = {
      controller: abortController,
      toastId,
      phase: "generating",
    };
    activeJob.current = job;
    setPhase("generating");

    const responses = service.loginCredentials(
      {
        instanceId: instanceInfo.id,
        service: AccountTypeCredentials.OFFLINE,
        payload: usernames,
      },
      {
        signal: abortController.signal,
      },
    );

    void observeServerStream(responses, {
      onMessage: async (r) => {
        if (activeJob.current !== job || abortController.signal.aborted) return;
        const data = r.data;
        switch (data.case) {
          case "oneSuccess": {
            if (data.value.account) {
              accountsToAdd.push(data.value.account);
            }
            success++;
            toast.loading(loadingReport(), {
              id: toastId,
              ...loadingData,
            });
            break;
          }
          case "oneFailure": {
            failed++;
            toast.loading(loadingReport(), {
              id: toastId,
              ...loadingData,
            });
            break;
          }
          case "end": {
            if (accountsToAdd.length === 0) {
              activeJob.current = null;
              setPhase("idle");
              toast.error(t("account.generate.allFailed"), {
                id: toastId,
                cancel: undefined,
              });
            } else {
              job.phase = "saving";
              setPhase("saving");
              toast.loading(loadingReport(), {
                id: toastId,
                cancel: undefined,
              });
              await onGenerate(accountsToAdd, value.mode);
              if (activeJob.current !== job) return;
              activeJob.current = null;
              setPhase("idle");
              onOpenChange(false);
              toast.success(
                t("account.generate.success", {
                  count: accountsToAdd.length,
                }),
                {
                  id: toastId,
                  cancel: undefined,
                },
              );
            }
            break;
          }
        }
      },
      onError: (e) => {
        if (activeJob.current !== job || abortController.signal.aborted) return;
        activeJob.current = null;
        console.error(e);
        setPhase("idle");
        toast.error(t("account.generate.error"), {
          id: toastId,
          cancel: undefined,
        });
      },
    });
  };

  const form = useForm({
    defaultValues: {
      amount: 1,
      nameFormat: "Bot_%d",
      mode: "IGNORE_EXISTING" as GenerateAccountsMode,
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      handleGenerate(value);
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
                      min={1}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(
                          Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                        )
                      }
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
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
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Bot_%d"
                      aria-invalid={isInvalid}
                    />
                    <FieldDescription>
                      {t("account.generate.nameFormatHelp")}
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
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
                      onValueChange={(value) =>
                        field.handleChange(value as GenerateAccountsMode)
                      }
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
              onClick={() => handleOpenChange(false)}
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
      </CredenzaContent>
    </Credenza>
  );
}
