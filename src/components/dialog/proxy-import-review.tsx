import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { getConnectionErrorKind } from "@/lib/connection-errors";
import { parseProxyImport } from "@/lib/proxy-import";
import type { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import type { ProfileProxy } from "@/lib/types";

export function ProxyImportReview({
  text,
  type,
  onBack,
  onImport,
}: {
  text: string;
  type: ProxyProto_Type | "uri";
  onBack: () => void;
  onImport: (proxies: ProfileProxy[]) => Promise<void>;
}) {
  const { t } = useTranslation("instance");
  const [draft, setDraft] = useState(text);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const result = parseProxyImport(draft, type);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onBack();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("proxy.import.review.title")}</DialogTitle>
          <DialogDescription>
            {t("proxy.import.review.description")}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="proxy-import-draft">
            {t("proxy.import.review.input")}
          </FieldLabel>
          <Textarea
            id="proxy-import-draft"
            data-ph-no-capture
            className="min-h-40"
            value={draft}
            disabled={pending}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <p role="status">
          {t("proxy.import.review.accepted", { count: result.proxies.length })}
        </p>
        {result.rejectedLines.length > 0 && (
          <Alert role="alert">
            <AlertDescription>
              {t("proxy.import.review.rejected", {
                count: result.rejectedLines.length,
                lines: result.rejectedLines.join(", "),
              })}
            </AlertDescription>
          </Alert>
        )}
        {error != null && (
          <Alert role="alert">
            <AlertDescription>
              {t(`proxy.import.review.error.${getConnectionErrorKind(error)}`)}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onBack}>
            {t("common:cancel")}
          </Button>
          <Button
            disabled={
              pending ||
              result.proxies.length === 0 ||
              result.rejectedLines.length > 0
            }
            aria-busy={pending}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                await onImport(result.proxies);
              } catch (reason) {
                setError(reason);
              } finally {
                setPending(false);
              }
            }}
          >
            {t(
              pending
                ? "proxy.import.review.importing"
                : "proxy.import.review.confirm",
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
