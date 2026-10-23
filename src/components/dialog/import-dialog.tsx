import { createClient } from "@connectrpc/connect";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { ClipboardIcon, FileIcon, GlobeIcon, TextIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { SystemInfoContext } from "@/components/providers/system-info-context.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { DownloadService } from "@/generated/soulfire/download_pb";
import { decodeTextDownload, DownloadHttpError } from "@/lib/download.ts";
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { ImportReadSession, readImportFile } from "@/lib/import-read.ts";
import { hasInstancePermission } from "@/lib/utils.tsx";

export type TextInput = {
  defaultValue: string;
};

export type ImportDialogProps = {
  title: string;
  description: string;
  closer: () => void;
  listener: (data: string) => void;
  isPending?: boolean;
  filters: {
    name: string;
    mimeType: string;
    extensions: string[];
  }[];
  allowMultiple: boolean;
  textInput: TextInput | null;
  extraContent?: ReactNode;
};

export default function ImportDialog(props: ImportDialogProps) {
  const [menuState, setMenuState] = useState<"main" | "url">("main");

  switch (menuState) {
    case "url":
      return <UrlDialog {...props} />;
    case "main":
      return (
        <MainDialog {...props} openUrlDialog={() => setMenuState("url")} />
      );
  }
}

function UrlDialog(props: ImportDialogProps) {
  const { t } = useTranslation("common");
  const transport = use(TransportContext);
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);

  const activeDownload = useRef<AbortController | null>(null);
  useEffect(() => () => activeDownload.current?.abort(), []);

  const urlSchema = z.object({
    url: z.string().url(t("dialog.import.url.form.url.empty")),
  });

  const form = useForm({
    defaultValues: {
      url: "",
    },
    validators: {
      onSubmit: urlSchema,
    },
    onSubmit: async ({ value }) => {
      if (transport === null) return;
      const controller = new AbortController();
      activeDownload.current = controller;
      try {
        const service = createClient(DownloadService, transport);
        const response = await service.download(
          {
            instanceId: instanceInfo.id,
            uri: value.url,
            headers: [],
          },
          { signal: controller.signal },
        );
        const text = decodeTextDownload(response);
        if (!text.trim()) {
          toast.error(t("dialog.import.url.toast.empty"));
          return;
        }
        props.listener(text);
        toast.success(t("dialog.import.url.toast.success"));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        toast.error(
          error instanceof DownloadHttpError
            ? t("dialog.import.url.toast.httpError", {
                status: error.statusCode,
              })
            : t("dialog.import.url.toast.error"),
        );
      } finally {
        activeDownload.current = null;
      }
    },
  });

  return (
    <Credenza open={true} onOpenChange={props.closer}>
      <CredenzaContent className="min-w-0">
        <form
          className="min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <CredenzaHeader>
            <CredenzaTitle>{props.title}</CredenzaTitle>
            <CredenzaDescription>
              {t("dialog.import.url.description")}
            </CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="pb-4 md:pb-0">
            <div className="flex flex-col gap-4">
              <form.Field name="url">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name} className="sr-only">
                        {t("dialog.import.url.form.url.placeholder")}
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        autoFocus
                        placeholder={t(
                          "dialog.import.url.form.url.placeholder",
                        )}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(e.currentTarget.value)
                        }
                        type="url"
                        inputMode="url"
                        disabled={props.isPending}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={isSubmitting || props.isPending}
                    aria-busy={isSubmitting || props.isPending}
                  >
                    <GlobeIcon />
                    <span>
                      {t(
                        isSubmitting
                          ? "dialog.import.url.toast.loading"
                          : "dialog.import.url.submit",
                      )}
                    </span>
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </CredenzaBody>
        </form>
      </CredenzaContent>
    </Credenza>
  );
}

function MainDialog(
  props: ImportDialogProps & {
    openUrlDialog: () => void;
  },
) {
  const { t } = useTranslation("common");
  const instanceInfoQueryOptions = useRouteContext({
    from: "/_dashboard/instance/$instance",
    select: (context) => context.instanceInfoQueryOptions,
  });
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const systemInfo = use(SystemInfoContext);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readSession] = useState(() => new ImportReadSession());
  const [isReading, startReading] = useTransition();
  const isPending = props.isPending || isReading;
  useEffect(() => () => readSession.cancel(), [readSession]);

  const read = (
    load: (signal: AbortSignal) => Promise<readonly string[]>,
    errorKey:
      | "dialog.import.main.fileError"
      | "dialog.import.main.clipboardError",
  ) => {
    startReading(async () => {
      try {
        await readSession.run(load, (texts) => {
          if (texts.length) props.listener(texts.join("\n"));
        });
      } catch (error) {
        console.error(error);
        toast.error(t(errorKey));
      }
    });
  };

  // Handle Ctrl+V paste - uses native event to avoid permission prompts
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (isPending) return;
      // Ignore if typing in an input or textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const text = event.clipboardData?.getData("text/plain");
      if (text) {
        event.preventDefault();

        props.listener(text);
      }
    },
    [props, isPending],
  );

  return (
    <Credenza
      open={true}
      onOpenChange={() => {
        readSession.cancel();
        props.closer();
      }}
    >
      <CredenzaContent className="min-w-0">
        <div className="min-w-0" onPaste={handlePaste}>
          <CredenzaHeader>
            <CredenzaTitle>{props.title}</CredenzaTitle>
            <CredenzaDescription>{props.description}</CredenzaDescription>
          </CredenzaHeader>
          <CredenzaBody className="pb-4 md:pb-0">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap justify-between gap-4">
                {!isDesktopApp() && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={props.filters.map((f) => f.mimeType).join(",")}
                    multiple={props.allowMultiple}
                    className="hidden"
                    disabled={isPending}
                    onChange={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (!target.files) {
                        return;
                      }

                      const files = Array.from(target.files);
                      target.value = "";
                      if (!files.length || isPending) return;
                      read(
                        (signal) =>
                          Promise.all(
                            files.map((file) => readImportFile(file, signal)),
                          ),
                        "dialog.import.main.fileError",
                      );
                    }}
                  />
                )}
                <Button
                  variant="secondary"
                  className="h-auto min-w-0 flex-1 basis-40 whitespace-normal"
                  disabled={isPending}
                  onClick={() => {
                    if (isDesktopApp()) {
                      read(async (signal) => {
                        const downloadsDir = await desktop.path.downloadDir();
                        signal.throwIfAborted();
                        const input = await desktop.dialog.open({
                          title: props.title,
                          filters: systemInfo?.mobile
                            ? undefined
                            : props.filters,
                          defaultPath: downloadsDir,
                          multiple: props.allowMultiple,
                          directory: false,
                        });
                        signal.throwIfAborted();
                        if (input === null) return [];

                        const toParse: string[] = Array.isArray(input)
                          ? input
                          : [input];
                        const texts: string[] = [];
                        for (const file of toParse) {
                          texts.push(await desktop.fs.readTextFile(file));
                          signal.throwIfAborted();
                        }
                        return texts;
                      }, "dialog.import.main.fileError");
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <FileIcon />
                  <span>{t("dialog.import.main.fromFile")}</span>
                </Button>
                {hasInstancePermission(
                  instanceInfo,
                  InstancePermission.DOWNLOAD_URL,
                ) && (
                  <Button
                    variant="secondary"
                    className="h-auto min-w-0 flex-1 basis-40 whitespace-normal"
                    disabled={isPending}
                    onClick={() => {
                      readSession.cancel();
                      props.openUrlDialog();
                    }}
                  >
                    <GlobeIcon />
                    <span>{t("dialog.import.main.fromUrl")}</span>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="h-auto min-w-0 flex-1 basis-40 whitespace-normal"
                  disabled={isPending}
                  onClick={() => {
                    read(async (signal) => {
                      if (isDesktopApp()) {
                        return [(await desktop.clipboard.readText()) ?? ""];
                      } else {
                        const mimeTypes = props.filters.map((f) => f.mimeType);
                        let clipboardEntries = (
                          await navigator.clipboard.read()
                        )
                          .map((item) => ({
                            item,
                            firstSupportedType: item.types.find((t) =>
                              mimeTypes.includes(t),
                            ),
                          }))
                          .filter(
                            (
                              e,
                            ): e is typeof e & {
                              firstSupportedType: string;
                            } => {
                              return e.firstSupportedType !== undefined;
                            },
                          );
                        signal.throwIfAborted();
                        if (
                          !props.allowMultiple &&
                          clipboardEntries.length > 1
                        ) {
                          toast.warning(
                            t("dialog.import.main.firstClipboardItem"),
                          );
                          clipboardEntries = [clipboardEntries[0]];
                        }

                        const texts: string[] = [];
                        for (const entry of clipboardEntries) {
                          const blob = await entry.item.getType(
                            entry.firstSupportedType,
                          );
                          signal.throwIfAborted();
                          texts.push(await blob.text());
                          signal.throwIfAborted();
                        }
                        return texts;
                      }
                    }, "dialog.import.main.clipboardError");
                  }}
                >
                  <ClipboardIcon />
                  <span>{t("dialog.import.main.fromClipboard")}</span>
                </Button>
              </div>
              {props.textInput !== null && (
                <TextInput
                  {...props}
                  isPending={isPending}
                  textInput={props.textInput}
                />
              )}
              {props.extraContent && (
                <>
                  <Separator orientation="horizontal" />
                  {props.extraContent}
                </>
              )}
            </div>
          </CredenzaBody>
        </div>
      </CredenzaContent>
    </Credenza>
  );
}

function TextInput(
  props: Omit<ImportDialogProps, "textInput"> & {
    textInput: TextInput;
  },
) {
  const { t } = useTranslation("common");
  const [inputText, setInputText] = useState(props.textInput.defaultValue);
  return (
    <>
      <Separator orientation="horizontal" />
      <div className="flex flex-col gap-4">
        <Textarea
          autoFocus
          disabled={props.isPending}
          placeholder={t("dialog.import.main.textarea.placeholder")}
          defaultValue={inputText}
          onChange={(e) => setInputText(e.currentTarget.value)}
        />
        <Button
          variant="secondary"
          className="w-full"
          disabled={props.isPending}
          aria-busy={props.isPending}
          onClick={() => {
            props.listener(inputText);
          }}
        >
          <TextIcon />
          <span>{t("dialog.import.main.textarea.submit")}</span>
        </Button>
      </div>
    </>
  );
}
