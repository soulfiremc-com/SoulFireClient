import { HeartIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "../ui/credenza.tsx";

const SUPPORT_DISMISSED_KEY = "sf-support-dismissed-at";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShowSupportDialog(): boolean {
  const dismissedAt = localStorage.getItem(SUPPORT_DISMISSED_KEY);
  if (!dismissedAt) {
    return true;
  }

  const elapsed = Date.now() - Number(dismissedAt);
  return elapsed >= SEVEN_DAYS_MS;
}

function dismissSupportDialog() {
  localStorage.setItem(SUPPORT_DISMISSED_KEY, String(Date.now()));
}

export function SupportDialogProvider(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldShowSupportDialog()) {
      setOpen(true);
    }
  }, []);

  return (
    <>
      {props.children}
      <SupportDialog
        open={open}
        setOpen={(value) => {
          if (!value) {
            dismissSupportDialog();
          }
          setOpen(value);
        }}
      />
    </>
  );
}

function SupportDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");

  return (
    <Credenza open={open} onOpenChange={setOpen}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="flex items-center gap-2">
            <HeartIcon className="size-5 text-destructive" />
            {t("dialog.support.title")}
          </CredenzaTitle>
          <CredenzaDescription>
            {t("dialog.support.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="space-y-3">
          <p className="text-sm">{t("dialog.support.body")}</p>
        </CredenzaBody>
        <CredenzaFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
            }}
          >
            {t("dialog.support.dismiss")}
          </Button>
          <Button
            nativeButton={false}
            render={
              <ExternalLink href="https://soulfiremc.com/pricing?utm_source=soulfire-client&utm_medium=app&utm_campaign=support-dialog" />
            }
            onClick={() => {
              setOpen(false);
            }}
          >
            <HeartIcon className="size-4" />
            {t("dialog.support.action")}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
