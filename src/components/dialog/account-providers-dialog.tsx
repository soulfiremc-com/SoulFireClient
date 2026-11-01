import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderLinks } from "@/components/providers/provider-links.tsx";
import { ProviderSelect } from "@/components/providers/provider-select.tsx";
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
} from "@/components/ui/credenza.tsx";
import { FieldDescription, FieldGroup } from "@/components/ui/field.tsx";
import { ACCOUNT_PROVIDERS } from "@/lib/resource-providers.ts";

export default function AccountProvidersDialog({
  open,
  onOpenChange,
  onRavealts,
  onLocalts,
  onFernan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRavealts: () => void;
  onLocalts: () => void;
  onFernan: () => void;
}) {
  const { t } = useTranslation("instance");
  const [providerId, setProviderId] = useState("ravealts");
  const provider = ACCOUNT_PROVIDERS.find((entry) => entry.id === providerId)!;
  const integrations: Partial<Record<string, () => void>> = {
    ravealts: onRavealts,
    localts: onLocalts,
    fernan: onFernan,
  };
  const openIntegration = integrations[providerId];
  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("account.getAccounts")}</CredenzaTitle>
          <CredenzaDescription>
            {t("providers.accountsDescription")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <FieldGroup>
            <ProviderSelect
              label={t("providers.provider")}
              value={providerId}
              onChange={setProviderId}
              items={ACCOUNT_PROVIDERS.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
            />
            <ProviderLinks provider={provider} />
            <FieldDescription>
              {t(
                openIntegration
                  ? "providers.ravealtsImport"
                  : "providers.accountFileImport",
              )}
            </FieldDescription>
          </FieldGroup>
        </CredenzaBody>
        <CredenzaFooter>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <ExternalLink href="https://soulfiremc.com/get-accounts?utm_source=soulfire-client" />
            }
          >
            {t("providers.allProviders")}
          </Button>
          {openIntegration && (
            <Button
              onClick={() => {
                onOpenChange(false);
                openIntegration();
              }}
            >
              {t("account.ravealts.purchase")}
            </Button>
          )}
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
