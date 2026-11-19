import { LoaderCircleIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";

export function ConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  /**
   * Return a promise to keep the dialog open with a pending state until the
   * action settles. Callers report errors themselves.
   */
  onConfirm: () => unknown;
}) {
  const { t } = useTranslation("common");
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!pending) {
          props.onOpenChange(open);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>{props.icon}</AlertDialogMedia>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              const result = props.onConfirm();
              if (!(result instanceof Promise)) {
                props.onOpenChange(false);
                return;
              }

              setPending(true);
              void result
                .catch(() => {
                  // The caller reports the error.
                })
                .finally(() => {
                  setPending(false);
                  props.onOpenChange(false);
                });
            }}
          >
            {pending && (
              <LoaderCircleIcon
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
