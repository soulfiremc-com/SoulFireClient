import { createClient } from "@connectrpc/connect";
import { ClientService } from "@soulfiremc/sdk/generated/soulfire/client_pb";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenTextIcon,
  CopyIcon,
  FoldersIcon,
  GlobeIcon,
  PlusIcon,
} from "lucide-react";
import { use, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink } from "@/components/external-link.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";

export const Route = createFileRoute("/_dashboard/user/access")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.access"), {
      kind: "dynamic",
      name: "zap",
    }),
  component: AccessPage,
});

function AccessCardSkeleton() {
  return (
    <div className="container rounded-lg border p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-4 w-64" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-20" />
          </div>
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    </div>
  );
}

function AccessSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <AccessCardSkeleton />
      <AccessCardSkeleton />
    </div>
  );
}

function AccessPage() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout
      showUserCrumb={true}
      pageName={t("pageName.access")}
      loadingSkeleton={<AccessSkeleton />}
    >
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const copyToClipboard = useCopyToClipboard();
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  const transport = use(TransportContext);
  const [webDavToken, setWebDavToken] = useState("");
  const [apiToken, setApiToken] = useState("");
  const webdavAddressId = useId();
  const webdavTokenId = useId();
  const apiAddressId = useId();
  const apiTokenId = useId();

  return (
    <div className="flex flex-col gap-4">
      <Card className="container">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <FoldersIcon />
            <span>{t("access.webdav.title")}</span>
          </CardTitle>
          <CardDescription>{t("access.webdav.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={webdavAddressId}>
              {t("access.webdav.publicAddress")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={webdavAddressId}
                className="select-all"
                value={clientInfo.serverInfo?.publicWebdavAddress}
                readOnly
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => {
                    copyToClipboard(
                      clientInfo.serverInfo?.publicWebdavAddress || "",
                    );
                  }}
                >
                  <CopyIcon />
                  <span>{t("access.address.copy")}</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t("access.webdav.addressDescription")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={webdavTokenId}>
              {t("access.webdav.personalToken")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={webdavTokenId}
                className="select-all"
                disabled={webDavToken === ""}
                value={webDavToken}
                placeholder={t("access.token.placeholder")}
                readOnly
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => {
                    copyToClipboard(webDavToken);
                  }}
                  disabled={webDavToken === ""}
                >
                  <CopyIcon />
                  <span>{t("access.token.copy")}</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t("access.webdav.securityWarning")}
            </FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={() => {
              if (transport === null) {
                return;
              }

              const clientService = createClient(ClientService, transport);
              toast.promise(
                clientService.generateWebDAVToken({}).then((response) => {
                  setWebDavToken(response.token);
                  copyToClipboard(response.token);
                }),
                {
                  loading: t("access.token.generating"),
                  success: t("access.token.success"),
                  error: (error) => {
                    console.error(error);
                    return t("access.token.error");
                  },
                },
              );
            }}
          >
            <PlusIcon />
            <span>{t("access.token.generate")}</span>
          </Button>
          <Button
            variant="secondary"
            nativeButton={false}
            render={
              <ExternalLink href="https://soulfiremc.com/docs/guides/webdav?utm_source=soulfire-client&utm_medium=app&utm_campaign=access-webdav-docs" />
            }
          >
            <BookOpenTextIcon />
            <span>{t("access.howToConnect")}</span>
          </Button>
        </CardFooter>
      </Card>
      <Card className="container">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <GlobeIcon />
            <span>{t("access.api.title")}</span>
          </CardTitle>
          <CardDescription>{t("access.api.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={apiAddressId}>
              {t("access.api.publicAddress")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={apiAddressId}
                className="select-all"
                value={clientInfo.serverInfo?.publicApiAddress}
                readOnly
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => {
                    copyToClipboard(
                      clientInfo.serverInfo?.publicApiAddress || "",
                    );
                  }}
                >
                  <CopyIcon />
                  <span>{t("access.address.copy")}</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t("access.api.addressDescription")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={apiTokenId}>
              {t("access.api.personalToken")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={apiTokenId}
                className="select-all"
                disabled={apiToken === ""}
                value={apiToken}
                placeholder={t("access.token.placeholder")}
                readOnly
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() => {
                    copyToClipboard(apiToken);
                  }}
                  disabled={apiToken === ""}
                >
                  <CopyIcon />
                  <span>{t("access.token.copy")}</span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {t("access.api.securityWarning")}
            </FieldDescription>
          </Field>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            onClick={() => {
              if (transport === null) {
                return;
              }

              const clientService = createClient(ClientService, transport);
              toast.promise(
                clientService.generateAPIToken({}).then((response) => {
                  setApiToken(response.token);
                  copyToClipboard(response.token);
                }),
                {
                  loading: t("access.token.generating"),
                  success: t("access.token.success"),
                  error: (error) => {
                    console.error(error);
                    return t("access.token.error");
                  },
                },
              );
            }}
          >
            <PlusIcon />
            <span>{t("access.token.generate")}</span>
          </Button>
          <Button
            variant="secondary"
            nativeButton={false}
            render={
              <ExternalLink href={clientInfo.serverInfo?.publicDocsAddress} />
            }
          >
            <BookOpenTextIcon />
            <span>{t("access.documentation")}</span>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
