import type { ReactNode } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";

export function SettingInputLayout(props: {
  title: ReactNode;
  children: ReactNode;
  invalid?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Field
      className="max-w-3xl min-w-0"
      data-invalid={props.invalid}
      data-disabled={props.disabled}
      aria-busy={props.busy}
    >
      {props.title}
      <div className="flex min-w-0 flex-col gap-2">{props.children}</div>
    </Field>
  );
}

export function ComponentTitle(props: {
  title: ReactNode;
  description: ReactNode;
  inputId?: string;
  descriptionId?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {props.inputId ? (
        <FieldLabel htmlFor={props.inputId}>{props.title}</FieldLabel>
      ) : (
        <p className="text-sm font-medium">{props.title}</p>
      )}
      {props.description && (
        <FieldDescription id={props.descriptionId}>
          {props.description}
        </FieldDescription>
      )}
    </div>
  );
}
