import {
  ArrowUpRightIcon,
  BookOpenTextIcon,
  ChevronDownIcon,
  ClipboardIcon,
  CodeXmlIcon,
  KeyRoundIcon,
  ListIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  MonitorIcon,
  SparklesIcon,
  SquareTerminalIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeSample } from "@/components/developer/code-sample.tsx";
import { ExternalLink } from "@/components/external-link.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
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
  buildSdkAgentPrompt,
  buildSdkQuickstart,
  isLocalSdkServer,
  SDK_EXAMPLE_VERSION,
  type SdkLanguage,
  type SdkRecipe,
  type SdkShell,
} from "@/lib/sdk-quickstart.ts";

export type SdkQuickstartBot = { id: string; name: string; online?: boolean };
export type SdkQuickstartInstance = { id: string; name: string };

type Props = {
  serverUrl: string | null;
  instanceId: string;
  instanceName: string;
  instances?: SdkQuickstartInstance[];
  onInstanceChange?: (instanceId: string) => void;
  bots: SdkQuickstartBot[];
  demo?: boolean;
  integrated?: boolean;
  impersonating?: boolean;
  generateToken?: (signal: AbortSignal) => Promise<string>;
  onOpenAccounts: () => void;
  onOpenBots: () => void;
};

const recipes = [
  { id: "list-bots", Icon: ListIcon },
  { id: "read-state", Icon: MonitorIcon },
  { id: "send-chat", Icon: MessageSquareIcon },
] as const;

export function SdkQuickstart({
  serverUrl,
  instanceId,
  instanceName,
  instances = [],
  onInstanceChange,
  bots,
  demo = false,
  integrated = false,
  impersonating = false,
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
  const bot =
    bots.find((entry) => entry.id === botId) ??
    bots.find((entry) => entry.online) ??
    bots[0];
  const needsBot = recipe !== "list-bots";
  const options = {
    language,
    recipe,
    shell,
    serverUrl: serverUrl ?? "",
    instanceId,
    botId: bot?.id,
    demo,
  };
  const example = buildSdkQuickstart(options);
  const agentPrompt = buildSdkAgentPrompt({
    ...options,
    instanceName,
    botName: bot?.name,
  });
  const copyDisabled = needsBot && !bot;
  const local = !!serverUrl && isLocalSdkServer(serverUrl);
  const terminalLanguage =
    shell === "powershell" ? "powershell" : "shellscript";
  const availableInstances = instances.some((entry) => entry.id === instanceId)
    ? instances
    : [{ id: instanceId, name: instanceName }, ...instances];

  async function createToken() {
    if (
      !generateToken ||
      pending.current ||
      demo ||
      impersonating ||
      !serverUrl
    )
      return;
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
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => copy(agentPrompt)}>
            <SparklesIcon data-icon="inline-start" />
            {t("sdk.copyAgentPrompt")}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<ExternalLink href="https://soulfiremc.com/docs/sdk" />}
          >
            <BookOpenTextIcon data-icon="inline-start" />
            {t("sdk.docs")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <h2>{t("sdk.connectionTitle")}</h2>
            </CardTitle>
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
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-url`}>
                {t("sdk.serverUrl")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-url`}
                  readOnly
                  value={serverUrl ?? ""}
                  placeholder={
                    demo ? "YOUR_SOULFIRE_SERVER_URL" : t("sdk.noUrl")
                  }
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
              <FieldDescription>
                {t(demo ? "sdk.demoBody" : "sdk.connectionDescription")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-instance`}>
                {t("sdk.targetTitle")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                {availableInstances.length > 1 && onInstanceChange ? (
                  <Select
                    value={instanceId}
                    onValueChange={(value) => {
                      if (value && value !== instanceId)
                        onInstanceChange(value);
                    }}
                    items={availableInstances.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                  >
                    <SelectTrigger id={`${id}-instance`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      listProps={{ "aria-label": t("sdk.targetTitle") }}
                    >
                      <SelectGroup>
                        {availableInstances.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-instance`}
                      readOnly
                      value={instanceName}
                    />
                  </InputGroup>
                )}
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t("sdk.copyInstanceId")}
                  onClick={() => copy(instanceId)}
                >
                  <ClipboardIcon />
                </Button>
              </div>
              <FieldDescription>
                <code>{instanceId}</code>
              </FieldDescription>
            </Field>
          </FieldGroup>
          {!demo && (
            <>
              <Separator />
              {token ? (
                <Field>
                  <FieldLabel htmlFor={`${id}-token`}>
                    {t("sdk.token")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-token`}
                      type="password"
                      autoComplete="off"
                      readOnly
                      value={token}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        aria-label={t("sdk.copyToken")}
                        onClick={() => copy(token)}
                      >
                        <ClipboardIcon />
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>{t("sdk.tokenHelp")}</FieldDescription>
                </Field>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {generateToken && !impersonating && serverUrl && (
                    <Button
                      variant="outline"
                      disabled={generating}
                      onClick={() => void createToken()}
                    >
                      {generating ? (
                        <LoaderCircleIcon
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      ) : (
                        <KeyRoundIcon data-icon="inline-start" />
                      )}
                      {t(generating ? "sdk.generating" : "sdk.generateToken")}
                    </Button>
                  )}
                  <p className="max-w-2xl text-xs text-muted-foreground">
                    {t(
                      impersonating
                        ? "sdk.impersonatingHelp"
                        : !serverUrl
                          ? "sdk.missingUrlHelp"
                          : !generateToken
                            ? "sdk.tokenPermission"
                            : "sdk.tokenSetupHelp",
                    )}
                  </p>
                </div>
              )}
              {tokenError && (
                <Alert>
                  <AlertTitle>{t("sdk.tokenError")}</AlertTitle>
                  <AlertDescription>{t("sdk.tokenRetry")}</AlertDescription>
                </Alert>
              )}
              {serverUrl && local && (
                <p className="text-xs text-muted-foreground">
                  {t(integrated ? "sdk.integratedHelp" : "sdk.localHelp")}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby={`${id}-example`}
      >
        <h2 id={`${id}-example`} className="text-lg font-semibold">
          {t("sdk.exampleTitle")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
        <p className="text-sm text-muted-foreground">
          {t(`sdk.recipes.${recipe}.description`)}
        </p>
        {needsBot && bot && (
          <Field>
            <FieldLabel htmlFor={`${id}-bot`}>{t("sdk.bot")}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
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
                <SelectTrigger id={`${id}-bot`} className="w-full sm:max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent listProps={{ "aria-label": t("sdk.bot") }}>
                  <SelectGroup>
                    {bots.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name}
                        {entry.online !== undefined && (
                          <span className="text-muted-foreground">
                            {" "}
                            ·{" "}
                            {t(
                              entry.online ? "sdk.botOnline" : "sdk.botOffline",
                            )}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={onOpenBots}>
                {t("sdk.openBots")}
                <ArrowUpRightIcon data-icon="inline-end" />
              </Button>
            </div>
            {bot.online !== undefined && (
              <FieldDescription>
                {t(bot.online ? "sdk.botOnline" : "sdk.botOffline")}
              </FieldDescription>
            )}
          </Field>
        )}
        {needsBot && !bot && (
          <Alert>
            <UnplugIcon />
            <AlertTitle>{t("sdk.noBotsTitle")}</AlertTitle>
            <AlertDescription>{t("sdk.noBotsBody")}</AlertDescription>
            <Button variant="outline" className="mt-2" onClick={onOpenAccounts}>
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
          language={language}
          copyLabel={t("sdk.copyScript")}
          disabled={copyDisabled}
        />
        <div className="flex items-start gap-2 text-sm">
          <SquareTerminalIcon className="mt-0.5 size-4 shrink-0" />
          <p>{t(`sdk.recipes.${recipe}.expected`)}</p>
        </div>

        <Collapsible>
          <CollapsibleTrigger render={<Button variant="outline" />}>
            <SquareTerminalIcon data-icon="inline-start" />
            {t("sdk.runTitle")}
            <ChevronDownIcon data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex min-w-0 flex-col gap-4 pt-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  language === "python"
                    ? "sdk.pythonRequirement"
                    : "sdk.typescriptRequirement",
                )}
              </p>
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
                  <SelectTrigger
                    id={`${id}-shell`}
                    className="w-full sm:max-w-sm"
                  >
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
              <p className="text-xs text-muted-foreground">
                {t("sdk.saveScript", { filename: example.filename })}
              </p>
              <CodeSample
                title={t("sdk.install")}
                code={example.install}
                language={terminalLanguage}
                copyLabel={t("sdk.copyInstall")}
              />
              <CodeSample
                title={t("sdk.run")}
                code={example.run}
                language={terminalLanguage}
                copyLabel={t("sdk.copyRun")}
              />
              <p className="text-sm text-muted-foreground">
                {t("sdk.replaceToken")}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {t("sdk.previewAgentPrompt")}
            <ChevronDownIcon data-icon="inline-end" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"
              tabIndex={0}
              aria-label={t("sdk.agentPrompt")}
            >
              {agentPrompt}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </section>

      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("sdk.version", { version: SDK_EXAMPLE_VERSION })}
        </p>
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
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="ghost" className="w-fit" />}
        >
          {t("sdk.helpTitle")}
          <ChevronDownIcon data-icon="inline-end" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-4 pt-4 md:grid-cols-3">
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
