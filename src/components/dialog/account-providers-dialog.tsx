import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AccountImport,
  FernanFlow,
} from "@/components/providers/flows/fernan-flow.tsx";
import { LocaltsFlow } from "@/components/providers/flows/localts-flow.tsx";
import { RavealtsFlow } from "@/components/providers/flows/ravealts-flow.tsx";
import { ProviderGallery } from "@/components/providers/provider-gallery.tsx";
import { Credenza, CredenzaContent } from "@/components/ui/credenza.tsx";
import { ACCOUNT_PROVIDERS } from "@/lib/resource-providers.ts";

const FLOWS: Partial<Record<string, typeof FernanFlow>> = {
  fernan: FernanFlow,
  localts: LocaltsFlow,
  ravealts: RavealtsFlow,
};

export default function AccountProvidersDialog({
  open,
  onOpenChange,
  onImport,
  canPurchase,
  initialProviderId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: AccountImport;
  canPurchase: boolean;
  initialProviderId?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Credenza
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <CredenzaContent className="gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <AccountProvidersContent
          canPurchase={canPurchase}
          initialProviderId={initialProviderId}
          onBusyChange={setBusy}
          onClose={() => onOpenChange(false)}
          onImport={onImport}
        />
      </CredenzaContent>
    </Credenza>
  );
}

// Mounted only while the dialog is open, so closing it clears session keys.
function AccountProvidersContent({
  canPurchase,
  initialProviderId,
  onBusyChange,
  onClose,
  onImport,
}: {
  canPurchase: boolean;
  initialProviderId?: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onImport: AccountImport;
}) {
  const { t } = useTranslation("instance");
  const [selectedId, setSelectedId] = useState(
    initialProviderId ?? ACCOUNT_PROVIDERS[0].id,
  );
  const [activeId, setActiveId] = useState(initialProviderId ?? null);
  const active = ACCOUNT_PROVIDERS.find((entry) => entry.id === activeId);
  const Flow = active && FLOWS[active.id];
  if (active && Flow)
    return (
      <Flow
        key={active.id}
        provider={active}
        canWrite={canPurchase}
        onBack={() => setActiveId(null)}
        onBusyChange={onBusyChange}
        onClose={onClose}
        onImport={onImport}
      />
    );
  return (
    <ProviderGallery
      title={t("account.getAccounts")}
      description={t("providers.accountsDescription")}
      providers={ACCOUNT_PROVIDERS}
      selectedId={selectedId}
      resource="accounts"
      canWrite={canPurchase}
      compareUrl="https://soulfiremc.com/get-accounts?utm_source=soulfire-client"
      onSelect={setSelectedId}
      onConnect={(provider) => setActiveId(provider.id)}
    />
  );
}
