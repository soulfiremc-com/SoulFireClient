import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { ConnectError } from "@connectrpc/connect";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenTextIcon,
  CopyIcon,
  FoldersIcon,
  GlobeIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, Suspense, use, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink } from "@/components/external-link.tsx";
import UserPageLayout from "@/components/nav/user/user-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import {
  type ClientDataResponse,
  ClientService,
} from "@/generated/soulfire/client_pb";
import { GlobalPermission } from "@/generated/soulfire/common_pb";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import { staticRouteChrome } from "@/lib/route-title.ts";
import { hasGlobalPermission } from "@/lib/utils.tsx";

export const Route = createFileRoute("/_dashboard/user/access")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.access"), {
      kind: "dynamic",
      name: "zap",
    }),
  component: AccessPage,
});

type TokenKind = "webdav" | "api";

/// Reads the client data, so only the values that need it wait for the query.
function WithClientData({
  children,
}: {
  children: (clientData: ClientDataResponse) => ReactNode;
}) {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return children(clientInfo);
}

function AccessPage() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout showUserCrumb pageName={t("pageName.access")}>
      <div className="grid w-full grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <AccessCard
          kind="webdav"
          icon={FoldersIcon}
          title={t("access.webdav.title")}
          description={t("access.webdav.description")}
          addressDescription={t("access.webdav.addressDescription")}
          tokenDescription={t("access.webdav.securityWarning")}
          permission={GlobalPermission.GENERATE_SELF_WEBDAV_TOKEN}
          getAddress={(serverInfo) => serverInfo?.publicWebdavAddress}
          docs={
            <DocsButton href="https://soulfiremc.com/docs/guides/webdav?utm_source=soulfire-client&utm_medium=app&utm_campaign=access-webdav-docs">
              {t("access.howToConnect")}
            </DocsButton>
          }
        />
        <AccessCard
          kind="api"
          icon={GlobeIcon}
          title={t("access.api.title")}
          description={t("access.api.description")}
          tokenDescription={t("access.api.securityWarning")}
          permission={GlobalPermission.GENERATE_SELF_API_TOKEN}
          getAddress={(serverInfo) => serverInfo?.publicApiAddress}
          docs={
            <Suspense fallback={<Skeleton className="h-8 w-32" />}>
              <WithClientData>
                {(clientData) =>
                  clientData.serverInfo?.publicDocsAddress ? (
                    <DocsButton href={clientData.serverInfo.publicDocsAddress}>
                      {t("access.documentation")}
                    </DocsButton>
                  ) : null
                }
              </WithClientData>
            </Suspense>
          }
        />
      </div>
    </UserPageLayout>
  );
}

function DocsButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<ExternalLink href={href} />}
    >
      <BookOpenTextIcon data-icon="inline-start" />
      {children}
    </Button>
  );
}

function AccessCard({
  kind,
  icon: Icon,
  title,
  description,
  addressDescription,
  tokenDescription,
  permission,
  getAddress,
  docs,
}: {
  kind: TokenKind;
  icon: LucideIcon;
  title: string;
  description: string;
  addressDescription?: string;
  tokenDescription: string;
  permission: GlobalPermission;
  getAddress: (
    serverInfo: ClientDataResponse["serverInfo"],
  ) => string | undefined;
  docs: ReactNode;
}) {
  const { t } = useTranslation("common");
  const copyToClipboard = useCopyToClipboard();
  const copySecret = useCopyToClipboard({ sensitive: true });
  const transport = use(TransportContext);
  const [token, setToken] = useState("");
  const addressId = useId();
  const tokenId = useId();
  const tokenDescriptionId = useId();
  const generateToken = useMutation({
    mutationKey: ["access", "generate-token", kind],
    mutationFn: async () => {
      if (transport === null) {
        toast.info(t("demoReadOnly"));
        return;
      }

      const clientService = createRpcClient(ClientService, transport);
      const promise = Effect.runPromise<{ token: string }, ConnectError>(
        kind === "webdav"
          ? clientService.generateWebDAVToken({})
          : clientService.generateAPIToken({}),
      ).then((response) => {
        setToken(response.token);
        void copySecret(response.token);
        return undefined;
      });
      toast.promise(promise, {
        loading: t("access.token.generating"),
        success: t("access.token.success"),
        error: (error) => {
          console.error(error);
          return {
            message: t("access.token.error"),
            description: ConnectError.from(error).rawMessage,
          };
        },
      });
      await promise;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Icon />
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>{docs}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor={addressId}>
            {t("access.address.label")}
          </FieldLabel>
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <WithClientData>
              {(clientData) => {
                const address = getAddress(clientData.serverInfo) ?? "";
                return (
                  <InputGroup>
                    <InputGroupInput
                      id={addressId}
                      className="select-all"
                      value={address}
                      readOnly
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        disabled={address === ""}
                        onClick={() => {
                          void copyToClipboard(address);
                        }}
                      >
                        <CopyIcon />
                        <span>{t("access.address.copy")}</span>
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                );
              }}
            </WithClientData>
          </Suspense>
          {addressDescription && (
            <FieldDescription>{addressDescription}</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={tokenId}>{t("access.token.label")}</FieldLabel>
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <WithClientData>
              {(clientData) => {
                const canGenerate = hasGlobalPermission(clientData, permission);
                return (
                  <>
                    <InputGroup>
                      <InputGroupInput
                        id={tokenId}
                        className="select-all"
                        value={token}
                        placeholder={t("access.token.placeholder")}
                        aria-describedby={tokenDescriptionId}
                        readOnly
                      />
                      <InputGroupAddon align="inline-end">
                        {token !== "" && (
                          <InputGroupButton
                            onClick={() => {
                              void copySecret(token);
                            }}
                          >
                            <CopyIcon />
                            <span>{t("access.token.copy")}</span>
                          </InputGroupButton>
                        )}
                        <InputGroupButton
                          variant="default"
                          disabled={!canGenerate || generateToken.isPending}
                          aria-busy={generateToken.isPending}
                          onClick={() => {
                            generateToken.mutate();
                          }}
                        >
                          {generateToken.isPending ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <KeyRoundIcon />
                          )}
                          <span>{t("access.token.generate")}</span>
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription id={tokenDescriptionId}>
                      {canGenerate
                        ? tokenDescription
                        : t("access.token.noPermission")}
                    </FieldDescription>
                  </>
                );
              }}
            </WithClientData>
          </Suspense>
        </Field>
      </CardContent>
    </Card>
  );
}
