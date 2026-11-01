import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProxyFlow } from "@/components/providers/flows/proxy-flow.tsx";
import { ProviderGallery } from "@/components/providers/provider-gallery.tsx";
import { Credenza, CredenzaContent } from "@/components/ui/credenza.tsx";
import { PROXY_PROVIDERS } from "@/lib/resource-providers.ts";
import type { ProfileProxy } from "@/lib/types.ts";

export default function ProxyProvidersDialog({
  open,
  onOpenChange,
  onImport,
  canImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (proxies: ProfileProxy[]) => Promise<void>;
  canImport: boolean;
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
        <ProxyProvidersContent
          canImport={canImport}
          onBusyChange={setBusy}
          onClose={() => onOpenChange(false)}
          onImport={onImport}
        />
      </CredenzaContent>
    </Credenza>
  );
}

// Mounted only while the dialog is open, so closing it clears session keys.
function ProxyProvidersContent({
  canImport,
  onBusyChange,
  onClose,
  onImport,
}: {
  canImport: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onImport: (proxies: ProfileProxy[]) => Promise<void>;
}) {
  const { t } = useTranslation("instance");
  const [selectedId, setSelectedId] = useState(PROXY_PROVIDERS[0].id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = PROXY_PROVIDERS.find((entry) => entry.id === activeId);
  if (active?.connection)
    return (
      <ProxyFlow
        key={active.id}
        provider={active}
        canWrite={canImport}
        onBack={() => setActiveId(null)}
        onBusyChange={onBusyChange}
        onClose={onClose}
        onImport={onImport}
      />
    );
  return (
    <ProviderGallery
      title={t("proxy.getProxies")}
      description={t("providers.proxiesDescription")}
      providers={PROXY_PROVIDERS}
      selectedId={selectedId}
      resource="proxies"
      canWrite={canImport}
      compareUrl="https://soulfiremc.com/get-proxies?utm_source=soulfire-client"
      onSelect={setSelectedId}
      onConnect={(provider) => setActiveId(provider.id)}
    />
  );
}
