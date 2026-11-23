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
  LoaderCircleIcon,
  PlusIcon,
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
import {
  type ClientDataResponse,
  ClientService,
} from "@/generated/soulfire/client_pb";
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

type ServerInfo = NonNullable<ClientDataResponse["serverInfo"]>;

/// Reads the server addresses, so only the values that need them wait for the query.
function WithServerInfo({
  children,
}: {
  children: (serverInfo: ServerInfo | undefined) => ReactNode;
}) {
  const { clientDataQueryOptions } = Route.useRouteContext();
  const { data: clientInfo } = useSuspenseQuery(clientDataQueryOptions);
  return children(clientInfo.serverInfo);
}

function AccessPage() {
  const { t } = useTranslation("common");

  return (
    <UserPageLayout showUserCrumb pageName={t("pageName.access")}>
      <Content />
    </UserPageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const copyToClipboard = useCopyToClipboard();
  const copySecret = useCopyToClipboard({ sensitive: true });
  const transport = use(TransportContext);
  const [webDavToken, setWebDavToken] = useState("");
  const [apiToken, setApiToken] = useState("");
  const generateTokenMutation = useMutation({
    mutationKey: ["access", "generate-token"],
    mutationFn: async (kind: "webdav" | "api") => {
      if (transport === null) {
        toast.info(t("demoReadOnly"));
        return undefined;
      }

      const clientService = createRpcClient(ClientService, transport);
      const request =
        kind === "webdav"
          ? Effect.runPromise(clientService.generateWebDAVToken({}))
          : Effect.runPromise(clientService.generateAPIToken({}));
      const promise = request.then((response) => {
        if (kind === "webdav") {
          setWebDavToken(response.token);
        } else {
          setApiToken(response.token);
        }
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
      return promise;
    },
  });
  const generatingKind = generateTokenMutation.isPending
    ? generateTokenMutation.variables
    : null;
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
            <Suspense fallback={<Skeleton className="h-9 w-full" />}>
              <WithServerInfo>
                {(serverInfo) => (
                  <InputGroup>
                    <InputGroupInput
                      id={webdavAddressId}
                      className="select-all"
                      value={serverInfo?.publicWebdavAddress}
                      readOnly
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        onClick={() => {
                          void copyToClipboard(
                            serverInfo?.publicWebdavAddress || "",
                          );
                        }}
                      >
                        <CopyIcon />
                        <span>{t("access.address.copy")}</span>
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                )}
              </WithServerInfo>
            </Suspense>
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
                    void copySecret(webDavToken);
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
            disabled={generateTokenMutation.isPending}
            onClick={() => {
              generateTokenMutation.mutate("webdav");
            }}
          >
            {generatingKind === "webdav" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <PlusIcon />
            )}
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
            <Suspense fallback={<Skeleton className="h-9 w-full" />}>
              <WithServerInfo>
                {(serverInfo) => (
                  <InputGroup>
                    <InputGroupInput
                      id={apiAddressId}
                      className="select-all"
                      value={serverInfo?.publicApiAddress}
                      readOnly
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        onClick={() => {
                          void copyToClipboard(
                            serverInfo?.publicApiAddress || "",
                          );
                        }}
                      >
                        <CopyIcon />
                        <span>{t("access.address.copy")}</span>
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                )}
              </WithServerInfo>
            </Suspense>
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
                    void copySecret(apiToken);
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
            disabled={generateTokenMutation.isPending}
            onClick={() => {
              generateTokenMutation.mutate("api");
            }}
          >
            {generatingKind === "api" ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <PlusIcon />
            )}
            <span>{t("access.token.generate")}</span>
          </Button>
          <Suspense fallback={<Skeleton className="h-9 w-36" />}>
            <WithServerInfo>
              {(serverInfo) => (
                <Button
                  variant="secondary"
                  nativeButton={false}
                  render={<ExternalLink href={serverInfo?.publicDocsAddress} />}
                >
                  <BookOpenTextIcon />
                  <span>{t("access.documentation")}</span>
                </Button>
              )}
            </WithServerInfo>
          </Suspense>
        </CardFooter>
      </Card>
    </div>
  );
}
