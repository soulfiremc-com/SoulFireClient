import { useSelector } from "@tanstack/react-store";
import { Settings2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  parseScriptQuotaInputs,
  SCRIPT_QUOTA_LIMITS,
  scriptQuotasToInputs,
} from "@/lib/script-quota-input";

const quotaFields = [
  {
    field: "maxExecutionCount",
    label: "maxExecutionCount",
    placeholder: "maxExecutionCountPlaceholder",
    description: "maxExecutionCountDescription",
  },
  {
    field: "maxExecutionTimeMs",
    label: "maxExecutionTime",
    placeholder: "maxExecutionTimePlaceholder",
    description: "maxExecutionTimeDescription",
  },
  {
    field: "maxConcurrentTriggers",
    label: "maxConcurrentTriggers",
    placeholder: "maxConcurrentTriggersPlaceholder",
    description: "maxConcurrentTriggersDescription",
  },
  {
    field: "maxStateStoreEntries",
    label: "maxStateStoreEntries",
    placeholder: "maxStateStoreEntriesPlaceholder",
    description: "maxStateStoreEntriesDescription",
  },
] as const;

/**
 * Dialog for configuring script execution quotas.
 * Empty fields use server defaults.
 */
export function QuotasDialog() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const quotas = useSelector(editor.document, (s) => s.quotas);
  const setQuotas = editor.actions.setQuotas;
  const [open, setOpen] = useState(false);
  const id = useId();

  const [inputs, setInputs] = useState(() => scriptQuotasToInputs(quotas));
  const validation = parseScriptQuotaInputs(inputs);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setInputs(scriptQuotasToInputs(quotas));
    setOpen(nextOpen);
  };

  const handleSave = () => {
    if (!validation.valid) return;
    setQuotas(validation.quotas);
    setOpen(false);
  };

  return (
    <Credenza open={open} onOpenChange={handleOpenChange}>
      <CredenzaTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            title={t("scripts.editor.quotas.tooltip")}
          />
        }
      >
        <Settings2 className="h-4 w-4" />
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("scripts.editor.quotas.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("scripts.editor.quotas.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex flex-col gap-4">
          <FieldGroup className="gap-4">
            {quotaFields.map(({ field, label, placeholder, description }) => {
              const invalid =
                !validation.valid && validation.fields.includes(field);
              const hintId = `${id}-${field}-hint`;
              const errorId = `${id}-${field}-error`;
              return (
                <Field key={field} data-invalid={invalid}>
                  <FieldLabel htmlFor={`${id}-${field}`}>
                    {t(`scripts.editor.quotas.${label}`)}
                  </FieldLabel>
                  <Input
                    id={`${id}-${field}`}
                    inputMode="numeric"
                    placeholder={t(`scripts.editor.quotas.${placeholder}`)}
                    value={inputs[field]}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
                    className="h-8 text-sm"
                  />
                  <FieldDescription id={hintId} className="text-xs">
                    {t(`scripts.editor.quotas.${description}`)}
                  </FieldDescription>
                  {invalid && (
                    <FieldError id={errorId}>
                      {t("scripts.editor.quotas.invalidInteger", {
                        min: SCRIPT_QUOTA_LIMITS[field].min.toString(),
                        max: SCRIPT_QUOTA_LIMITS[field].max.toString(),
                      })}
                    </FieldError>
                  )}
                </Field>
              );
            })}
          </FieldGroup>

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
              checked={inputs.disableTimeouts}
              onCheckedChange={(disableTimeouts) =>
                setInputs((current) => ({ ...current, disableTimeouts }))
              }
            />
          </Field>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!validation.valid}
          >
            {t("scripts.editor.quotas.save")}
          </Button>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
