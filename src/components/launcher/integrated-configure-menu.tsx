import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TextInfoButton } from "@/components/info-buttons.tsx";
import { IntegratedServerSupportActions } from "@/components/IntegratedServerDiagnostics";
import {
  AUTO_START_KEY,
  CUSTOM_JAR_ID_KEY,
  DEFAULT_JVM_ARGS,
  JAR_SOURCE_KEY,
  JVM_ARGS_KEY,
  SOFTWARE_RENDERING_KEY,
} from "@/components/launcher/integrated-settings.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { DesktopCustomSoulFireServerJar } from "@/lib/desktop-api.ts";
import { desktop } from "@/lib/desktop.ts";
import { formatBytes } from "@/lib/format.ts";

type JarSource = "official" | "custom";

/** Saves a launcher setting at once, so auto-start uses what the screen shows. */
function persist(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

export function IntegratedConfigureMenu({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: () => void;
}) {
  const { t } = useTranslation("login");
  const [customJars, setCustomJars] = useState<
    DesktopCustomSoulFireServerJar[]
  >([]);
  // Until the list loads, a saved custom jar cannot be checked, so Start
  // waits instead of claiming that no jar is selected.
  const [customJarsStatus, setCustomJarsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [jarSource, setJarSource] = useState<JarSource>(() =>
    localStorage.getItem(JAR_SOURCE_KEY) === "custom" ? "custom" : "official",
  );
  const [customJarId, setCustomJarId] = useState(
    () => localStorage.getItem(CUSTOM_JAR_ID_KEY) ?? "",
  );
  const [jvmArgs, setJvmArgs] = useState(
    () => localStorage.getItem(JVM_ARGS_KEY) ?? DEFAULT_JVM_ARGS,
  );
  const [forceSoftwareRendering, setForceSoftwareRendering] = useState(
    () => localStorage.getItem(SOFTWARE_RENDERING_KEY) === "true",
  );
  const [autoStart, setAutoStart] = useState(
    () => localStorage.getItem(AUTO_START_KEY) === "true",
  );
  const [importingCustomJar, setImportingCustomJar] = useState(false);
  const autoStartId = useId();
  const softwareRenderingId = useId();
  const jvmArgsId = useId();
  const jarSourceLabelId = useId();

  const selectJarSource = (source: JarSource) => {
    setJarSource(source);
    persist(JAR_SOURCE_KEY, source);
  };
  const selectCustomJar = (jarId: string) => {
    selectJarSource("custom");
    setCustomJarId(jarId);
    persist(CUSTOM_JAR_ID_KEY, jarId || null);
  };
  const changeJvmArgs = (value: string) => {
    setJvmArgs(value);
    // Store only custom arguments, so a later release can change the defaults.
    persist(JVM_ARGS_KEY, value === DEFAULT_JVM_ARGS ? null : value);
  };

  // Load the jar list once. Selecting a jar does not change it, and import
  // and remove update it themselves.
  const loadCustomJars = useCallback(() => {
    void desktop.integratedServer
      .listCustomJars()
      .then((jars) => {
        setCustomJars(jars);
        setCustomJarsStatus("ready");
        // A jar deleted outside the app cannot start.
        const savedJarId = localStorage.getItem(CUSTOM_JAR_ID_KEY);
        if (savedJarId && !jars.some((jar) => jar.id === savedJarId)) {
          setCustomJarId("");
          persist(CUSTOM_JAR_ID_KEY, null);
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        setCustomJarsStatus("error");
      });
  }, []);
  useEffect(() => {
    loadCustomJars();
  }, [loadCustomJars]);

  const importCustomJar = async () => {
    const selectedPath = await desktop.dialog.open({
      filters: [
        {
          extensions: ["jar"],
          name: t("integrated.form.jar.dialog.filter"),
        },
      ],
      title: t("integrated.form.jar.dialog.title"),
    });
    if (typeof selectedPath !== "string") return;

    setImportingCustomJar(true);
    try {
      const jar = await desktop.integratedServer.importCustomJar(selectedPath);
      setCustomJars(await desktop.integratedServer.listCustomJars());
      setCustomJarsStatus("ready");
      selectCustomJar(jar.id);
      toast.success(
        t("integrated.form.jar.importSuccess", { name: jar.originalName }),
      );
    } catch (error) {
      // The desktop error is English IPC text, so keep it out of the UI.
      console.error(error);
      toast.error(t("integrated.form.jar.importError"));
    } finally {
      setImportingCustomJar(false);
    }
  };

  const removeCustomJar = async (jarId: string) => {
    try {
      await desktop.integratedServer.removeCustomJar(jarId);
    } catch (error) {
      console.error(error);
      toast.error(t("integrated.form.jar.removeError"));
      return;
    }
    setCustomJars((jars) => jars.filter((jar) => jar.id !== jarId));
    // Keep the custom choice, so the launcher asks for another jar instead
    // of quietly starting the official server.
    if (customJarId === jarId) selectCustomJar("");
  };

  // Matches getIntegratedJarSource: a custom choice needs a jar, and the
  // official jar is never used in its place.
  const isStartBlocked =
    jarSource === "custom" &&
    (customJarsStatus !== "ready" ||
      !customJars.some((jar) => jar.id === customJarId));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!isStartBlocked) onStart();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("integrated.title")}</CardTitle>
          <CardDescription>{t("integrated.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2 text-sm">
            {(["prepare", "start", "connect"] as const).map((step) => (
              <li key={step} className="flex items-start gap-2">
                <CheckIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                {t(`integrated.plan.${step}`)}
              </li>
            ))}
          </ol>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={autoStartId}>
                {t("integrated.autoStart.title")}
              </FieldLabel>
              <FieldDescription>
                {t("integrated.autoStart.description")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={autoStartId}
              checked={autoStart}
              onCheckedChange={(checked) => {
                setAutoStart(checked);
                persist(AUTO_START_KEY, String(checked));
              }}
            />
          </Field>
          <Collapsible defaultOpen={jarSource === "custom"}>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="group/advanced w-fit"
                />
              }
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              {t("integrated.advanced.title")}
              <ChevronRightIcon
                data-icon="inline-end"
                className="group-data-panel-open/advanced:rotate-90"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 flex flex-col gap-4 rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">
                  {t("integrated.advanced.description")}
                </p>
                <Field orientation="horizontal">
                  <FieldContent>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor={softwareRenderingId}>
                        {t("integrated.softwareRendering.title")}
                      </FieldLabel>
                      <TextInfoButton
                        value={t("integrated.softwareRendering.description")}
                      />
                    </div>
                  </FieldContent>
                  <Switch
                    id={softwareRenderingId}
                    checked={forceSoftwareRendering}
                    onCheckedChange={(checked) => {
                      setForceSoftwareRendering(checked);
                      persist(SOFTWARE_RENDERING_KEY, String(checked));
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={jvmArgsId}>
                    {t("integrated.form.jvmArgs.title")}
                  </FieldLabel>
                  <Textarea
                    id={jvmArgsId}
                    rows={2}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    placeholder={t("integrated.form.jvmArgs.placeholder")}
                    value={jvmArgs}
                    onKeyDown={(e) => {
                      // Keep Enter as "start", like the other launcher fields.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    onChange={(e) => {
                      changeJvmArgs(e.target.value);
                    }}
                  />
                  {jvmArgs !== DEFAULT_JVM_ARGS && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        changeJvmArgs(DEFAULT_JVM_ARGS);
                      }}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      {t("integrated.form.jvmArgs.reset")}
                    </Button>
                  )}
                  <FieldDescription>
                    <Trans
                      i18nKey="login:integrated.form.jvmArgs.description"
                      components={{
                        bold: <strong className="text-nowrap" />,
                      }}
                    />
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel id={jarSourceLabelId}>
                    {t("integrated.form.jar.title")}
                  </FieldLabel>
                  <RadioGroup
                    aria-labelledby={jarSourceLabelId}
                    value={jarSource}
                    onValueChange={(value) => {
                      if (value !== "custom") {
                        selectJarSource("official");
                        return;
                      }
                      // Pick the first jar when none is chosen yet.
                      const jarId = customJars.some(
                        (jar) => jar.id === customJarId,
                      )
                        ? customJarId
                        : (customJars[0]?.id ?? "");
                      selectCustomJar(jarId);
                    }}
                  >
                    {(["official", "custom"] as const).map((source) => (
                      <FieldLabel
                        key={source}
                        htmlFor={`${jarSourceLabelId}-${source}`}
                      >
                        <Field orientation="horizontal">
                          <RadioGroupItem
                            id={`${jarSourceLabelId}-${source}`}
                            value={source}
                          />
                          <FieldContent>
                            <FieldTitle>
                              {t(`integrated.form.jar.${source}Title`)}
                            </FieldTitle>
                            <FieldDescription>
                              {t(`integrated.form.jar.${source}Description`)}
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                  {jarSource === "custom" && (
                    <div className="flex flex-col gap-2 rounded-lg border p-3">
                      {customJarsStatus === "loading" && (
                        <Skeleton className="h-10 w-full" />
                      )}
                      {customJarsStatus === "error" && (
                        <Alert variant="destructive">
                          <TriangleAlertIcon />
                          <AlertDescription>
                            <div className="flex flex-col gap-2">
                              {t("integrated.form.jar.loadError")}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-fit"
                                onClick={() => {
                                  setCustomJarsStatus("loading");
                                  loadCustomJars();
                                }}
                              >
                                <RotateCcwIcon data-icon="inline-start" />
                                {t("integrated.retry")}
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                      {customJars.length > 0 && (
                        <RadioGroup
                          aria-label={t("integrated.form.jar.customTitle")}
                          value={customJarId}
                          onValueChange={selectCustomJar}
                        >
                          {customJars.map((jar) => (
                            <div
                              key={jar.id}
                              className="flex items-center gap-2"
                            >
                              <FieldLabel
                                className="min-w-0 flex-1"
                                htmlFor={jar.id}
                              >
                                <Field orientation="horizontal">
                                  <RadioGroupItem id={jar.id} value={jar.id} />
                                  <FieldContent>
                                    <FieldTitle className="truncate">
                                      {jar.originalName}
                                    </FieldTitle>
                                    <FieldDescription className="truncate text-xs">
                                      {formatBytes(jar.size)} -{" "}
                                      {jar.sha256.slice(0, 12)}
                                    </FieldDescription>
                                  </FieldContent>
                                </Field>
                              </FieldLabel>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t("integrated.form.jar.remove", {
                                  name: jar.originalName,
                                })}
                                onClick={() => {
                                  void removeCustomJar(jar.id);
                                }}
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        disabled={importingCustomJar}
                        onClick={() => {
                          void importCustomJar();
                        }}
                      >
                        {importingCustomJar ? (
                          <LoaderCircleIcon
                            className="animate-spin"
                            data-icon="inline-start"
                          />
                        ) : (
                          <UploadIcon data-icon="inline-start" />
                        )}
                        {t("integrated.form.jar.import")}
                      </Button>
                    </div>
                  )}
                </Field>
                <IntegratedServerSupportActions />
              </div>
            </CollapsibleContent>
          </Collapsible>
          {customJarsStatus === "ready" && isStartBlocked && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>
                {t("integrated.form.jar.selectCustomFirst")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" type="button" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            {t("integrated.form.back")}
          </Button>
          <Button type="submit" disabled={isStartBlocked}>
            <PlayIcon data-icon="inline-start" />
            {t("integrated.form.start")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
