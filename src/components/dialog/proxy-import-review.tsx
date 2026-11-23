import { useDeferredValue, useMemo, useState } from "react";
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
import { isDemoReadOnlyError } from "@/lib/instance-mutations";
import { parseProxyImport } from "@/lib/proxy-import";
import { removeProxyEntries } from "@/lib/proxy-selection";
import type { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import type { ProfileProxy } from "@/lib/types";

const MAX_LISTED_LINES = 10;
const NO_PROXIES: ProfileProxy[] = [];

function reviewImport(
  text: string,
  type: ProxyProto_Type | "uri",
  existingProxies: ProfileProxy[],
) {
  const { proxies, rejectedLines } = parseProxyImport(text, type);
  // Each existing entry skips one matching line. Repeats within the list stay,
  // since several identical entries let more bots share one rotating gateway.
  const additions = removeProxyEntries(proxies, existingProxies);
  return {
    additions,
    rejectedLines,
    alreadyInProject: proxies.length - additions.length,
  };
}

function formatRejectedLines(lines: number[]) {
  const listed = lines.slice(0, MAX_LISTED_LINES).join(", ");
  return lines.length > MAX_LISTED_LINES ? `${listed}, …` : listed;
}

export function ProxyImportReview({
  text,
  type,
  existingProxies = NO_PROXIES,
  onBack,
  onImport,
}: {
  text: string;
  type: ProxyProto_Type | "uri";
  /** Proxies already in the project. Matching entries are skipped. */
  existingProxies?: ProfileProxy[];
  onBack: () => void;
  /**
   * Receives the new proxies, how many rejected lines were skipped, and how
   * many entries were skipped because the project already has them.
   */
  onImport: (
    proxies: ProfileProxy[],
    skippedLines: number,
    alreadyInProject: number,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("instance");
  const [draft, setDraft] = useState(text);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Large lists take a while to parse, so typing stays responsive and the
  // summary catches up once React is idle.
  const deferredDraft = useDeferredValue(draft);
  const review = useMemo(
    () => reviewImport(deferredDraft, type, existingProxies),
    [deferredDraft, type, existingProxies],
  );
  const { additions, rejectedLines, alreadyInProject } = review;
  const confirmImport = async () => {
    // Import exactly what the text box holds, even if the summary lags behind.
    const current =
      deferredDraft === draft
        ? review
        : reviewImport(draft, type, existingProxies);
    if (current.additions.length === 0) return;
    setPending(true);
    setError(null);
    try {
      await onImport(
        current.additions,
        current.rejectedLines.length,
        current.alreadyInProject,
      );
    } catch (reason) {
      // The demo notice already explains a demo write.
      if (!isDemoReadOnlyError(reason)) setError(reason);
    } finally {
      setPending(false);
    }
  };

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
            className="max-h-[50dvh] min-h-40 overflow-y-auto"
            value={draft}
            disabled={pending}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </Field>
        <output className="block">
          {t("proxy.import.review.accepted", { count: additions.length })}
          {alreadyInProject > 0 &&
            ` ${t("proxy.import.review.alreadyInProject", { count: alreadyInProject })}`}
        </output>
        {rejectedLines.length > 0 && (
          <Alert role="alert">
            <AlertDescription>
              {t("proxy.import.review.rejected", {
                count: rejectedLines.length,
                lines: formatRejectedLines(rejectedLines),
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
            disabled={pending || additions.length === 0}
            aria-busy={pending}
            onClick={() => void confirmImport()}
          >
            {pending
              ? t("proxy.import.review.importing")
              : t("proxy.import.review.confirm", {
                  count: additions.length,
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
