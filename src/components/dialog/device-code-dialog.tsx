import { ClipboardCopyIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import { QRCode, QRCodeSvg } from "@/components/ui/qr-code.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { useMediaQuery } from "@/hooks/use-media-query.tsx";
import { openExternalUrl } from "@/lib/utils.tsx";

export interface DeviceCodeData {
  userCode: string;
  verificationUri: string;
  directVerificationUri: string;
}

export function DeviceCodeDialog({
  open,
  onOpenChange,
  deviceCodeData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceCodeData: DeviceCodeData;
}) {
  const { t } = useTranslation("instance");
  const copyToClipboard = useCopyToClipboard();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle>{t("account.deviceCodeDialog.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("account.deviceCodeDialog.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className={`flex gap-6 ${isDesktop ? "flex-row" : "flex-col"}`}>
            <div className="flex flex-1 flex-col gap-4">
              <Button
                onClick={() => {
                  openExternalUrl(deviceCodeData.directVerificationUri);
                }}
              >
                <ExternalLinkIcon />
                {t("account.deviceCodeDialog.openInBrowser")}
              </Button>
              <div className="flex items-center gap-2">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t("account.deviceCodeDialog.orManually")}
                </span>
                <Separator className="flex-1" />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("account.deviceCodeDialog.codeLabel")}
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-center font-mono text-lg font-semibold tracking-widest">
                    {deviceCodeData.userCode}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("account.deviceCodeDialog.copyCode")}
                    title={t("account.deviceCodeDialog.copyCode")}
                    onClick={() =>
                      void copyToClipboard(deviceCodeData.userCode)
                    }
                  >
                    <ClipboardCopyIcon />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">
                  {t("account.deviceCodeDialog.urlLabel")}
                </span>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 text-center text-sm break-all">
                    {deviceCodeData.verificationUri}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("account.deviceCodeDialog.copyUrl")}
                    title={t("account.deviceCodeDialog.copyUrl")}
                    onClick={() =>
                      void copyToClipboard(deviceCodeData.verificationUri)
                    }
                  >
                    <ClipboardCopyIcon />
                  </Button>
                </div>
              </div>
            </div>
            {isDesktop && (
              <div className="flex items-center justify-center">
                <QRCode value={deviceCodeData.directVerificationUri} size={200}>
                  <QRCodeSvg />
                </QRCode>
              </div>
            )}
          </div>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
