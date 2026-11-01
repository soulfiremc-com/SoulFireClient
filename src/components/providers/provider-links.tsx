import { ExternalLinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FieldDescription } from "@/components/ui/field.tsx";
import type { ResourceProvider } from "@/lib/resource-providers.ts";

export function ProviderLinks({ provider }: { provider: ResourceProvider }) {
  const { t } = useTranslation("instance");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<ExternalLink href={provider.url} />}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          {t("providers.openShop", { provider: provider.name })}
        </Button>
        {provider.docs && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<ExternalLink href={provider.docs} />}
          >
            {t("providers.connectionHelp")}
          </Button>
        )}
      </div>
      {provider.coupon && (
        <FieldDescription>
          {t("providers.checkoutCode", { code: provider.coupon })}
        </FieldDescription>
      )}
      <FieldDescription>{t("providers.affiliateDisclosure")}</FieldDescription>
    </div>
  );
}
