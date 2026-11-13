import {
  ArrowRightIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HistoryIcon,
  KeyRoundIcon,
  ShoppingCartIcon,
  type LucideIcon,
  UserRoundCheckIcon,
  WalletIcon,
  HashIcon,
  LayoutListIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { ProviderLogo } from "@/components/providers/provider-logo.tsx";
import {
  ChoiceCard,
  Notice,
  OfferCard,
  ProviderFrame,
} from "@/components/providers/provider-ui.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { RadioGroup } from "@/components/ui/radio-group.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type {
  ProviderCapability,
  ProviderRequirement,
  ResourceProvider,
} from "@/lib/resource-providers.ts";

type Filter = "all" | "buy" | "import" | "checkout";

const capabilityIcons: Record<ProviderCapability, LucideIcon> = {
  buy: ShoppingCartIcon,
  import: DownloadIcon,
  recover: HistoryIcon,
  checkout: ExternalLinkIcon,
};
const requirementIcons: Record<ProviderRequirement, LucideIcon> = {
  apiKey: KeyRoundIcon,
  proxyLogin: UserRoundCheckIcon,
  accountSign: KeyRoundIcon,
  orderId: HashIcon,
  subaccountId: HashIcon,
  balance: WalletIcon,
};

function CapabilityBadge({ capability }: { capability: ProviderCapability }) {
  const { t } = useTranslation("instance");
  const Icon = capabilityIcons[capability];
  return (
    <Badge variant={capability === "buy" ? "default" : "secondary"}>
      <Icon data-icon="inline-start" />
      {t(`providers.capabilityShort.${capability}`)}
    </Badge>
  );
}

export function ProviderGallery({
  title,
  description,
  providers,
  selectedId,
  resource,
  canWrite,
  compareUrl,
  onSelect,
  onConnect,
}: {
  title: string;
  description: string;
  providers: ResourceProvider[];
  selectedId: string;
  resource: "accounts" | "proxies";
  canWrite: boolean;
  compareUrl: string;
  onSelect: (id: string) => void;
  onConnect: (provider: ResourceProvider) => void;
}) {
  const { t } = useTranslation("instance");
  const [filter, setFilter] = useState<Filter>("all");
  const matches = (provider: ResourceProvider, value: Filter) =>
    value === "all" || provider.capabilities.includes(value);
  const visible = providers.filter((provider) => matches(provider, filter));
  const selected =
    visible.find((provider) => provider.id === selectedId) ?? visible[0];
  const native = !selected.capabilities.includes("checkout");

  return (
    <ProviderFrame
      title={title}
      description={description}
      leading={<LayoutListIcon aria-hidden className="text-primary size-6" />}
      providerId={undefined}
      aside={
        <ProviderDetail
          provider={selected}
          resource={resource}
          canWrite={canWrite}
        />
      }
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<ExternalLink href={compareUrl} />}
          >
            {t("providers.allProviders")}
          </Button>
          {native ? (
            <Button onClick={() => onConnect(selected)}>
              {t(
                selected.capabilities.includes("buy")
                  ? "providers.connectBuy"
                  : "providers.connectImport",
                { provider: selected.name },
              )}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              render={<ExternalLink href={selected.url} />}
            >
              {t("providers.openCheckout", { provider: selected.name })}
              <ExternalLinkIcon data-icon="inline-end" />
            </Button>
          )}
        </>
      }
    >
      <ToggleGroup
        aria-label={t("providers.filterLabel")}
        aria-orientation={undefined}
        variant="outline"
        size="sm"
        value={[filter]}
        className="flex-wrap"
        onValueChange={(next: string[]) => {
          if (next[0]) setFilter(next[0] as Filter);
        }}
      >
        {(["all", "buy", "import", "checkout"] as const)
          .filter((value) =>
            providers.some((provider) => matches(provider, value)),
          )
          .map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(`providers.filters.${value}`)}
              <span className="text-muted-foreground tabular-nums">
                {providers.filter((entry) => matches(entry, value)).length}
              </span>
            </ToggleGroupItem>
          ))}
      </ToggleGroup>
      <RadioGroup
        aria-label={t("providers.provider")}
        value={selected.id}
        onValueChange={(next) => onSelect(String(next))}
        className="sm:grid-cols-2"
      >
        {visible.map((provider) => (
          <ChoiceCard key={provider.id} value={provider.id}>
            <ProviderLogo providerId={provider.id} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-medium">{provider.name}</span>
              <div className="flex flex-wrap gap-1">
                {provider.capabilities
                  .filter((capability) => capability !== "recover")
                  .map((capability) => (
                    <CapabilityBadge key={capability} capability={capability} />
                  ))}
              </div>
            </div>
          </ChoiceCard>
        ))}
      </RadioGroup>
    </ProviderFrame>
  );
}

function DetailList({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-foreground/70 text-xs font-medium">{title}</h4>
      <ul className="flex flex-col gap-1.5 text-sm">{children}</ul>
    </section>
  );
}

function ProviderDetail({
  provider,
  resource,
  canWrite,
}: {
  provider: ResourceProvider;
  resource: "accounts" | "proxies";
  canWrite: boolean;
}) {
  const { t } = useTranslation("instance");
  const checkoutOnly = provider.capabilities.includes("checkout");
  return (
    <div
      data-provider={provider.id}
      className="flex flex-col gap-4"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <ProviderLogo providerId={provider.id} className="size-12" />
        <h3 className="text-base font-semibold">{provider.name}</h3>
      </div>
      <p className="text-sm">{t(`providers.catalog.${provider.id}.summary`)}</p>
      <div className="flex flex-wrap gap-1">
        {provider.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {t(`providers.tags.${tag}`)}
          </Badge>
        ))}
      </div>
      <OfferCard provider={provider} />
      <DetailList title={t("providers.inSoulFire")}>
        {checkoutOnly ? (
          <li className="flex gap-2">
            <ExternalLinkIcon
              aria-hidden
              className="text-foreground/70 mt-0.5 size-4 shrink-0"
            />
            {t(
              resource === "accounts"
                ? "providers.accountFileImport"
                : "providers.proxyFileImport",
            )}
          </li>
        ) : (
          provider.capabilities.map((capability) => (
            <li key={capability} className="flex gap-2">
              <CheckIcon
                aria-hidden
                className="text-success-emphasis mt-0.5 size-4 shrink-0"
              />
              {t(`providers.capability.${capability}`)}
            </li>
          ))
        )}
      </DetailList>
      {provider.needs.length > 0 && (
        <DetailList title={t("providers.youNeed")}>
          {provider.needs.map((need) => {
            const Icon = requirementIcons[need];
            return (
              <li key={need} className="flex gap-2">
                <Icon
                  aria-hidden
                  className="text-foreground/70 mt-0.5 size-4 shrink-0"
                />
                {t(`providers.requirement.${need}`, {
                  provider: provider.name,
                })}
              </li>
            );
          })}
        </DetailList>
      )}
      {!checkoutOnly && (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<ExternalLink href={provider.url} />}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          {t("providers.createAccount", { provider: provider.name })}
        </Button>
      )}
      {!canWrite && <Notice>{t("providers.demo")}</Notice>}
      <p className="text-foreground/70 text-xs">
        {t("providers.affiliateDisclosure")}
      </p>
    </div>
  );
}
