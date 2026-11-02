import {
  ArrowUpRightIcon,
  BookOpenTextIcon,
  CheckIcon,
  ClipboardIcon,
  CodeXmlIcon,
  KeyRoundIcon,
  ListIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  MonitorIcon,
  ServerIcon,
  SquareTerminalIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "@/components/external-link.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import {
  buildSdkQuickstart,
  isLocalSdkServer,
  SDK_EXAMPLE_VERSION,
  type SdkLanguage,
  type SdkRecipe,
  type SdkShell,
} from "@/lib/sdk-quickstart.ts";

export type SdkQuickstartBot = {
  id: string;
  name: string;
  online?: boolean;
};

type Props = {
  serverUrl: string | null;
  instanceId: string;
  instanceName: string;
  bots: SdkQuickstartBot[];
  demo?: boolean;
  integrated?: boolean;
  generateToken?: (signal: AbortSignal) => Promise<string>;
  onOpenAccounts: () => void;
  onOpenBots: () => void;
};

function CodeSample({
  title,
  code,
  copyLabel,
  disabled = false,
}: {
  title: string;
  code: string;
  copyLabel: string;
  disabled?: boolean;
}) {
  const copy = useCopyToClipboard({ sensitive: true });
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border">
      <figcaption className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <span className="truncate font-mono text-xs">{title}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => copy(code)}
        >
          <ClipboardIcon data-icon="inline-start" />
          {copyLabel}
        </Button>
      </figcaption>
      <pre
        className="overflow-x-auto bg-muted/40 p-4 text-xs leading-relaxed"
        tabIndex={0}
        aria-label={title}
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}

const recipes = [
  { id: "list-bots", Icon: ListIcon },
  { id: "read-state", Icon: MonitorIcon },
  { id: "send-chat", Icon: MessageSquareIcon },
] as const;

export function SdkQuickstart({
  serverUrl,
  instanceId,
  instanceName,
  bots,
  demo = false,
  integrated = false,
  generateToken,
  onOpenAccounts,
  onOpenBots,
}: Props) {
  const { t } = useTranslation("common");
  const copy = useCopyToClipboard({ sensitive: true });
  const id = useId();
  const [language, setLanguage] = useState<SdkLanguage>("typescript");
  const [shell, setShell] = useState<SdkShell>(() =>
    navigator.userAgent.includes("Windows") ? "powershell" : "posix",
  );
  const [recipe, setRecipe] = useState<SdkRecipe>("list-bots");
  const [botId, setBotId] = useState("");
  const [token, setToken] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tokenError, setTokenError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const bot = bots.find((entry) => entry.id === botId) ?? bots[0];
  const needsBot = recipe !== "list-bots";
  const example = buildSdkQuickstart({
    language,
    recipe,
    shell,
    serverUrl: serverUrl ?? "",
    instanceId: demo ? "YOUR_INSTANCE_ID" : instanceId,
    botId: demo ? undefined : bot?.id,
  });
  const copyDisabled = !serverUrl || (needsBot && !bot);
  const local = !!serverUrl && isLocalSdkServer(serverUrl);

  async function createToken() {
    if (!generateToken || pending.current || demo || !serverUrl) return;
    const controller = new AbortController();
    pending.current = controller;
    setGenerating(true);
    setTokenError(false);
    try {
      const value = await generateToken(controller.signal);
      if (!value.trim()) throw new Error("Empty API token");
      if (!controller.signal.aborted) setToken(value);
    } catch {
      if (!controller.signal.aborted) setTokenError(true);
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
      pending.current = null;
    }
  }

  return (
    <div className="container flex w-full max-w-6xl flex-col gap-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CodeXmlIcon className="size-6" />
            {t("sdk.title")}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("sdk.description")}
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<ExternalLink href="https://soulfiremc.com/docs/sdk" />}
        >
          <BookOpenTextIcon data-icon="inline-start" />
          {t("sdk.docs")}
        </Button>
      </div>

      {demo && (
        <Alert>
          <UnplugIcon />
          <AlertTitle>{t("sdk.demoTitle")}</AlertTitle>
          <AlertDescription>{t("sdk.demoBody")}</AlertDescription>
        </Alert>
      )}

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("sdk.connectionTitle")}</h2>
              </CardTitle>
              <CardDescription>
                {t("sdk.connectionDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${id}-url`}>
                    <ServerIcon />
                    {t("sdk.serverUrl")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-url`}
                      readOnly
                      value={serverUrl ?? ""}
                      placeholder={t("sdk.noUrl")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={t("sdk.copyUrl")}
                        disabled={!serverUrl}
                        onClick={() => serverUrl && copy(serverUrl)}
                      >
                        <ClipboardIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{t("sdk.serverUrlHelp")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-token`}>
                    <KeyRoundIcon />
                    {t("sdk.token")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-token`}
                      type="password"
                      autoComplete="off"
                      readOnly
                      value={token}
                      placeholder={t("sdk.tokenPlaceholder")}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={t("sdk.copyToken")}
                        disabled={!token}
                        onClick={() => copy(token)}
                      >
                        <ClipboardIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{t("sdk.tokenHelp")}</FieldDescription>
                </Field>
                <Button
                  disabled={
                    !generateToken ||
                    generating ||
                    demo ||
                    !serverUrl ||
                    !!token
                  }
                  onClick={() => void createToken()}
                >
                  {generating ? (
                    <LoaderCircleIcon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : token ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <KeyRoundIcon data-icon="inline-start" />
                  )}
                  {t(
                    generating
                      ? "sdk.generating"
                      : token
                        ? "sdk.tokenReady"
                        : "sdk.generateToken",
                  )}
                </Button>
                {!demo && !generateToken && (
                  <p className="text-sm text-muted-foreground">
                    {t("sdk.tokenPermission")}
                  </p>
                )}
                {tokenError && (
                  <Alert>
                    <AlertTitle>{t("sdk.tokenError")}</AlertTitle>
                    <AlertDescription>{t("sdk.tokenRetry")}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-2">
              <Badge variant="outline">
                {t(
                  demo
                    ? "sdk.demoBadge"
                    : !serverUrl
                      ? "sdk.unavailableBadge"
                      : local
                        ? "sdk.localBadge"
                        : "sdk.remoteBadge",
                )}
              </Badge>
              <p className="text-xs text-foreground/70">
                {t(
                  demo
                    ? "sdk.demoBody"
                    : !serverUrl
                      ? "sdk.missingUrlHelp"
                      : local
                        ? "sdk.localHelp"
                        : "sdk.remoteHelp",
                )}
              </p>
              {integrated && (
                <p className="text-xs text-foreground/70">
                  {t("sdk.integratedHelp")}
                </p>
              )}
            </CardFooter>
          </Card>

          <section
            className="flex flex-col gap-3 px-1"
            aria-labelledby={`${id}-target`}
          >
            <h2 id={`${id}-target`} className="font-medium">
              {t("sdk.targetTitle")}
            </h2>
            <p className="text-sm">{instanceName}</p>
            <InputGroup>
              <InputGroupInput
                aria-label={t("sdk.instanceId")}
                value={instanceId}
                readOnly
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={t("sdk.copyInstanceId")}
                  onClick={() => copy(instanceId)}
                >
                  <ClipboardIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-xs text-foreground/70">{t("sdk.targetHelp")}</p>
            <Button variant="outline" onClick={onOpenBots}>
              {t("sdk.openBots")}
              <ArrowUpRightIcon data-icon="inline-end" />
            </Button>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("sdk.exampleTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("sdk.exampleDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <ToggleGroup
                aria-orientation={undefined}
                variant="outline"
                aria-label={t("sdk.language")}
                value={[language]}
                onValueChange={(value) => {
                  if (value[0]) setLanguage(value[0] as SdkLanguage);
                }}
              >
                <ToggleGroupItem value="typescript">
                  TypeScript / Bun
                </ToggleGroupItem>
                <ToggleGroupItem value="python">Python</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup
                aria-orientation={undefined}
                variant="outline"
                className="flex-wrap"
                aria-label={t("sdk.recipe")}
                value={[recipe]}
                onValueChange={(value) => {
                  if (value[0]) setRecipe(value[0] as SdkRecipe);
                }}
              >
                {recipes.map(({ id: recipeId, Icon }) => (
                  <ToggleGroupItem key={recipeId} value={recipeId}>
                    <Icon data-icon="inline-start" />
                    {t(`sdk.recipes.${recipeId}.title`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-sm text-muted-foreground">
                {t(`sdk.recipes.${recipe}.description`)}
              </p>
              {needsBot && bot && (
                <Field>
                  <FieldLabel htmlFor={`${id}-bot`}>{t("sdk.bot")}</FieldLabel>
                  <Select
                    value={bot.id}
                    onValueChange={(value) => {
                      if (value) setBotId(value);
                    }}
                    items={bots.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                  >
                    <SelectTrigger id={`${id}-bot`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent listProps={{ "aria-label": t("sdk.bot") }}>
                      <SelectGroup>
                        {bots.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              {needsBot && !bot && (
                <Alert>
                  <UnplugIcon />
                  <AlertTitle>{t("sdk.noBotsTitle")}</AlertTitle>
                  <AlertDescription>{t("sdk.noBotsBody")}</AlertDescription>
                  <Button
                    variant="outline"
                    className="mt-2"
                    onClick={onOpenAccounts}
                  >
                    {t("sdk.openAccounts")}
                  </Button>
                </Alert>
              )}
              {recipe === "send-chat" && bot?.online === false && (
                <Alert>
                  <AlertTitle>{t("sdk.stoppedTitle")}</AlertTitle>
                  <AlertDescription>{t("sdk.stoppedBody")}</AlertDescription>
                </Alert>
              )}
              <CodeSample
                title={example.filename}
                code={example.script}
                copyLabel={t("sdk.copyScript")}
                disabled={copyDisabled}
              />
            </CardContent>
            <CardFooter>
              <p className="text-xs text-foreground/70">
                {t("sdk.saveScript", { filename: example.filename })}
              </p>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("sdk.runTitle")}</h2>
              </CardTitle>
              <CardDescription>
                {t(
                  language === "python"
                    ? "sdk.pythonRequirement"
                    : "sdk.typescriptRequirement",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <Field>
                <FieldLabel htmlFor={`${id}-shell`}>
                  {t("sdk.shell")}
                </FieldLabel>
                <Select
                  value={shell}
                  onValueChange={(value) => {
                    if (value) setShell(value as SdkShell);
                  }}
                  items={[
                    { value: "posix", label: "macOS / Linux" },
                    { value: "powershell", label: "Windows PowerShell" },
                  ]}
                >
                  <SelectTrigger id={`${id}-shell`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent listProps={{ "aria-label": t("sdk.shell") }}>
                    <SelectGroup>
                      <SelectItem value="posix">macOS / Linux</SelectItem>
                      <SelectItem value="powershell">
                        Windows PowerShell
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <CodeSample
                title={t("sdk.install")}
                code={example.install}
                copyLabel={t("sdk.copyInstall")}
              />
              <CodeSample
                title={t("sdk.run")}
                code={example.run}
                copyLabel={t("sdk.copyRun")}
                disabled={copyDisabled}
              />
              <p className="text-sm text-muted-foreground">
                {t("sdk.replaceToken")}
              </p>
              <div className="flex items-start gap-2 text-sm">
                <SquareTerminalIcon className="mt-0.5 size-4 shrink-0" />
                <p>{t(`sdk.recipes.${recipe}.expected`)}</p>
              </div>
            </CardContent>
            <CardFooter>
              <p className="text-xs text-foreground/70">
                {t("sdk.version", { version: SDK_EXAMPLE_VERSION })}
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>

      <Separator />
      <section className="flex flex-col gap-3" aria-labelledby={`${id}-help`}>
        <h2 id={`${id}-help`} className="text-lg font-semibold">
          {t("sdk.helpTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(["connection", "authentication", "compatibility"] as const).map(
            (topic) => (
              <div key={topic} className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">
                  {t(`sdk.help.${topic}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(`sdk.help.${topic}.body`)}
                </p>
              </div>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <ExternalLink
                href={
                  language === "python"
                    ? "https://py.soulfiremc.com/"
                    : "https://ts.soulfiremc.com/"
                }
              />
            }
          >
            {t("sdk.reference")}
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <ExternalLink href="https://soulfiremc.com/docs/sdk/recipes" />
            }
          >
            {t("sdk.moreExamples")}
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>
    </div>
  );
}
