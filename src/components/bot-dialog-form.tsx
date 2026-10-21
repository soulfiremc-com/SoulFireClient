import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DialogInput, ServerDialog } from "@/generated/soulfire/bot_pb";
import { getNumericSettingValue } from "@/lib/numeric-setting-value";
import { cn } from "@/lib/utils";

function inputValue(input: DialogInput["input"]): string {
  switch (input.case) {
    case "text":
      return input.value.initial;
    case "boolean":
      return String(input.value.initial);
    case "singleOption":
      return input.value.initialOptionId;
    case "numberRange":
      return String(input.value.initial);
    default:
      return "";
  }
}

export function BotDialogForm({
  dialog,
  pending,
  onSubmit,
}: {
  dialog: ServerDialog;
  pending: boolean;
  onSubmit: (buttonIndex: number, inputValues: Record<string, string>) => void;
}) {
  const { t } = useTranslation("instance");
  const id = useId();
  const [drafts, setDrafts] = useState<
    Record<string, { source: string; value: string }>
  >({});
  const [actions] = useState(() =>
    dialog.actions.map((button, index) => ({
      button,
      index,
      id: crypto.randomUUID(),
    })),
  );
  const [body] = useState(() =>
    dialog.body.map((element) => ({
      element: element.element,
      id: crypto.randomUUID(),
    })),
  );
  const values = Object.fromEntries(
    dialog.inputs.flatMap(({ input }) => {
      if (!input.case) return [];
      const source = inputValue(input);
      const draft = drafts[input.value.key];
      return [
        [input.value.key, draft?.source === source ? draft.value : source],
      ];
    }),
  );
  const update = (input: DialogInput["input"], value: string) => {
    if (!input.case) return;
    setDrafts((current) => ({
      ...current,
      [input.value.key]: { source: inputValue(input), value },
    }));
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = event.nativeEvent.submitter;
        const index =
          submitter instanceof HTMLButtonElement ? Number(submitter.value) : 0;
        if (pending) return;
        const inputValues = { ...values };
        if (index === -1) {
          // Cancel keeps native range values when their text drafts are incomplete.
          for (const { input } of dialog.inputs) {
            if (input.case !== "numberRange") continue;
            const { key, start, end } = input.value;
            const draft = inputValues[key];
            if (
              !draft?.trim() ||
              getNumericSettingValue(
                Number(draft),
                Math.min(start, end),
                Math.max(start, end),
                false,
              ) === undefined
            ) {
              delete inputValues[key];
            }
          }
        }
        onSubmit(index, inputValues);
      }}
      className="flex flex-col gap-4"
    >
      <p className="font-medium">{dialog.title}</p>
      {body.map(({ element, id }) => {
        if (element.case === "plainMessage")
          return (
            <p key={id} className="whitespace-pre-wrap text-sm">
              {element.value.contents}
            </p>
          );
        if (element.case === "item")
          return (
            <p key={id} className="text-sm">
              {element.value.description ?? element.value.itemId} ×{" "}
              {element.value.count}
            </p>
          );
        return null;
      })}
      {dialog.inputs.length > 0 && (
        <FieldGroup>
          {dialog.inputs.map(({ input }) => {
            if (!input.case) return null;
            const control = input.value;
            const fieldId = `${id}-${control.key}`;
            const value = values[control.key] ?? "";
            if (input.case === "boolean")
              return (
                <Field
                  key={control.key}
                  orientation="horizontal"
                  data-disabled={pending}
                >
                  <Checkbox
                    id={fieldId}
                    checked={value === "true"}
                    onCheckedChange={(checked) =>
                      update(input, String(checked))
                    }
                    disabled={pending}
                  />
                  <FieldLabel htmlFor={fieldId}>
                    {control.label || control.key}
                  </FieldLabel>
                </Field>
              );
            return (
              <Field key={control.key} data-disabled={pending}>
                <FieldLabel
                  htmlFor={fieldId}
                  className={cn(
                    "labelVisible" in control &&
                      !control.labelVisible &&
                      "sr-only",
                  )}
                >
                  {control.label || control.key}
                </FieldLabel>
                {input.case === "text" &&
                  (input.value.multiline ? (
                    <Textarea
                      id={fieldId}
                      value={value}
                      maxLength={input.value.maxLength}
                      rows={Math.min(input.value.multilineMaxLines || 3, 10)}
                      onChange={(event) => update(input, event.target.value)}
                      disabled={pending}
                    />
                  ) : (
                    <Input
                      id={fieldId}
                      value={value}
                      maxLength={input.value.maxLength}
                      onChange={(event) => update(input, event.target.value)}
                      disabled={pending}
                    />
                  ))}
                {input.case === "singleOption" && (
                  <Select
                    value={value}
                    onValueChange={(value) => {
                      if (value !== null) update(input, value);
                    }}
                    disabled={pending}
                    items={input.value.options.map((option) => ({
                      value: option.id,
                      label: option.display,
                    }))}
                  >
                    <SelectTrigger id={fieldId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {input.value.options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.display}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
                {input.case === "numberRange" && (
                  <Input
                    id={fieldId}
                    type="number"
                    value={value}
                    min={Math.min(input.value.start, input.value.end)}
                    max={Math.max(input.value.start, input.value.end)}
                    step="any"
                    required
                    onChange={(event) => update(input, event.target.value)}
                    disabled={pending || input.value.start === input.value.end}
                  />
                )}
              </Field>
            );
          })}
        </FieldGroup>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map(({ button, index, id }) => (
          <Button
            key={id}
            type="submit"
            value={index}
            variant="outline"
            title={button.tooltip}
            disabled={pending}
          >
            {button.label || t("bots.dialogPanel.submit")}
          </Button>
        ))}
        {dialog.canCloseWithEscape && (
          <Button
            type="submit"
            value={-1}
            variant="ghost"
            formNoValidate
            disabled={pending}
          >
            {t("bots.dialogPanel.dismiss")}
          </Button>
        )}
      </div>
    </form>
  );
}
