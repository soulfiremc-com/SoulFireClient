import { useParams } from "@tanstack/react-router";
import { Effect } from "effect";
import { use, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type MetadataAdapter,
  MetadataEditor,
} from "@/components/metadata-editor.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
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
import { InstanceService } from "@/generated/soulfire/instance_pb";
import { jsonToValue } from "@/lib/protobuf.ts";
import { createRpcClient } from "@/lib/rpc";
import type { ProfileAccount } from "@/lib/types.ts";

export function AccountMetadataDialog({
  account,
  open,
  onOpenChange,
}: {
  account: ProfileAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("instance");
  const transport = use(TransportContext);
  const instanceId = useParams({
    from: "/_dashboard/instance/$instance",
    select: (params) => params.instance,
  });
  const accountId = account.profileId;
  const adapter = useMemo<MetadataAdapter | null>(() => {
    if (transport === null) return null;
    const service = createRpcClient(InstanceService, transport);
    return {
      mutationKey: ["account", "metadata", instanceId, accountId],
      load: async (signal) =>
        (
          await Effect.runPromise(
            service.getAccountMetadata({ instanceId, accountId }, { signal }),
          )
        ).metadata,
      set: (entry) =>
        Effect.runPromise(
          service.setAccountMetadataEntry({
            instanceId,
            accountId,
            ...entry,
            value: jsonToValue(entry.value),
          }),
        ),
      delete: (entry) =>
        Effect.runPromise(
          service.deleteAccountMetadataEntry({
            instanceId,
            accountId,
            ...entry,
          }),
        ),
    };
  }, [transport, instanceId, accountId]);

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-[700px]">
        <CredenzaHeader>
          <CredenzaTitle>
            {t("account.metadata.title", { name: account.lastKnownName })}
          </CredenzaTitle>
          <CredenzaDescription>
            {t("account.metadata.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          {open && <MetadataEditor key={accountId} adapter={adapter} />}
        </CredenzaBody>
        <CredenzaFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t("common:close")}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
