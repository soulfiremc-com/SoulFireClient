import { create } from "@bufbuild/protobuf";
import {
  type ScriptQuotas,
  ScriptQuotasSchema,
} from "@soulfiremc/sdk/generated/soulfire/script_pb";
import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useScriptEditorStore } from "@/stores/script-editor-store";

function bigintToInput(value: bigint | undefined): string {
  return value?.toString() ?? "";
}

function parseOptionalBigIntInput(value: string): bigint | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : BigInt(trimmed);
}

/**
 * Dialog for configuring script execution quotas.
 * Empty fields use server defaults.
 */
export function QuotasDialog() {
  const { t } = useTranslation("instance");
  const quotas = useScriptEditorStore((s) => s.quotas);
  const setQuotas = useScriptEditorStore((s) => s.setQuotas);
  const [open, setOpen] = useState(false);
  const id = useId();

  // Local form state (strings for controlled inputs)
  const [maxExecutionCount, setMaxExecutionCount] = useState("");
  const [maxExecutionTimeMs, setMaxExecutionTimeMs] = useState("");
  const [maxConcurrentTriggers, setMaxConcurrentTriggers] = useState("");
  const [maxStateStoreEntries, setMaxStateStoreEntries] = useState("");
  const [disableTimeouts, setDisableTimeouts] = useState(false);

  // Sync local state when dialog opens
  useEffect(() => {
    if (open) {
      setMaxExecutionCount(bigintToInput(quotas?.maxExecutionCount));
      setMaxExecutionTimeMs(bigintToInput(quotas?.maxExecutionTimeMs));
      setMaxConcurrentTriggers(
        quotas?.maxConcurrentTriggers != null
          ? String(quotas.maxConcurrentTriggers)
          : "",
      );
      setMaxStateStoreEntries(bigintToInput(quotas?.maxStateStoreEntries));
      setDisableTimeouts(quotas?.disableTimeouts ?? false);
    }
  }, [open, quotas]);

  const handleSave = useCallback(() => {
    const parsedMaxExecutionCount = parseOptionalBigIntInput(maxExecutionCount);
    const parsedMaxExecutionTimeMs =
      parseOptionalBigIntInput(maxExecutionTimeMs);
    const parsedMaxStateStoreEntries =
      parseOptionalBigIntInput(maxStateStoreEntries);
    const hasAnyValue =
      maxExecutionCount ||
      maxExecutionTimeMs ||
      maxConcurrentTriggers ||
      maxStateStoreEntries ||
      disableTimeouts;

    if (!hasAnyValue) {
      setQuotas(undefined);
    } else {
      const newQuotas: ScriptQuotas = create(ScriptQuotasSchema, {
        disableTimeouts,
        ...(parsedMaxExecutionCount !== undefined && {
          maxExecutionCount: parsedMaxExecutionCount,
        }),
        ...(parsedMaxExecutionTimeMs !== undefined && {
          maxExecutionTimeMs: parsedMaxExecutionTimeMs,
        }),
        ...(maxConcurrentTriggers && {
          maxConcurrentTriggers: Number(maxConcurrentTriggers),
        }),
        ...(parsedMaxStateStoreEntries !== undefined && {
          maxStateStoreEntries: parsedMaxStateStoreEntries,
        }),
      });
      setQuotas(newQuotas);
    }
    setOpen(false);
  }, [
    maxExecutionCount,
    maxExecutionTimeMs,
    maxConcurrentTriggers,
    maxStateStoreEntries,
    disableTimeouts,
    setQuotas,
  ]);

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={t("scripts.editor.quotas.tooltip")}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("scripts.editor.quotas.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("scripts.editor.quotas.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-maxExecutionCount`}>
              {t("scripts.editor.quotas.maxExecutionCount")}
            </FieldLabel>
            <Input
              id={`${id}-maxExecutionCount`}
              type="number"
              placeholder={t(
                "scripts.editor.quotas.maxExecutionCountPlaceholder",
              )}
              value={maxExecutionCount}
              onChange={(e) => setMaxExecutionCount(e.target.value)}
              className="h-8 text-sm"
            />
            <FieldDescription className="text-xs">
              {t("scripts.editor.quotas.maxExecutionCountDescription")}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-maxExecutionTimeMs`}>
              {t("scripts.editor.quotas.maxExecutionTime")}
            </FieldLabel>
            <Input
              id={`${id}-maxExecutionTimeMs`}
              type="number"
              placeholder={t(
                "scripts.editor.quotas.maxExecutionTimePlaceholder",
              )}
              value={maxExecutionTimeMs}
              onChange={(e) => setMaxExecutionTimeMs(e.target.value)}
              className="h-8 text-sm"
            />
            <FieldDescription className="text-xs">
              {t("scripts.editor.quotas.maxExecutionTimeDescription")}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-maxConcurrentTriggers`}>
              {t("scripts.editor.quotas.maxConcurrentTriggers")}
            </FieldLabel>
            <Input
              id={`${id}-maxConcurrentTriggers`}
              type="number"
              placeholder={t(
                "scripts.editor.quotas.maxConcurrentTriggersPlaceholder",
              )}
              value={maxConcurrentTriggers}
              onChange={(e) => setMaxConcurrentTriggers(e.target.value)}
              className="h-8 text-sm"
            />
            <FieldDescription className="text-xs">
              {t("scripts.editor.quotas.maxConcurrentTriggersDescription")}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-maxStateStoreEntries`}>
              {t("scripts.editor.quotas.maxStateStoreEntries")}
            </FieldLabel>
            <Input
              id={`${id}-maxStateStoreEntries`}
              type="number"
              placeholder={t(
                "scripts.editor.quotas.maxStateStoreEntriesPlaceholder",
              )}
              value={maxStateStoreEntries}
              onChange={(e) => setMaxStateStoreEntries(e.target.value)}
              className="h-8 text-sm"
            />
            <FieldDescription className="text-xs">
              {t("scripts.editor.quotas.maxStateStoreEntriesDescription")}
            </FieldDescription>
          </Field>

          <Field
            orientation="horizontal"
            className="items-start justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor={`${id}-disableTimeouts`}>
                {t("scripts.editor.quotas.disableTimeouts")}
              </FieldLabel>
              <FieldDescription className="text-xs">
                {t("scripts.editor.quotas.disableTimeoutsDescription")}
              </FieldDescription>
            </div>
            <Switch
              id={`${id}-disableTimeouts`}
              checked={disableTimeouts}
              onCheckedChange={setDisableTimeouts}
            />
          </Field>

          <Button className="w-full" onClick={handleSave}>
            {t("scripts.editor.quotas.save")}
          </Button>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
