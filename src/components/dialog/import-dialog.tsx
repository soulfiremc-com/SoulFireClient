import { useAptabase } from "@aptabase/react";
import { createClient } from "@connectrpc/connect";
import { InstancePermission } from "@soulfiremc/sdk/generated/soulfire/common_pb";
import { DownloadService } from "@soulfiremc/sdk/generated/soulfire/download_pb";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { ClipboardIcon, FileIcon, GlobeIcon, TextIcon } from "lucide-react";
import MimeMatcher from "mime-matcher";
import type { ReactNode } from "react";
import { use, useCallback, useRef, useState } from "react";
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
import { desktop, isDesktopApp } from "@/lib/desktop.ts";
import { hasInstancePermission, runAsync } from "@/lib/utils.tsx";

export type TextInput = {
  defaultValue: string;
};

export type ImportDialogProps = {
  title: string;
  description: string;
  closer: () => void;
  listener: (data: string) => void;
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
  const { trackEvent } = useAptabase();

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
      void trackEvent("import_from_url");

      const download = async () => {
        if (transport === null) {
          return;
        }

        const service = createClient(DownloadService, transport);
        const response = await service.download({
          instanceId: instanceInfo.id,
          uri: value.url,
          headers: [],
        });

        const decoder = new TextDecoder();
        props.listener(decoder.decode(response.data));
      };

      toast.promise(download(), {
        loading: t("dialog.import.url.toast.loading"),
        success: t("dialog.import.url.toast.success"),
        error: (e) => {
          console.error(e);
          return t("dialog.import.url.toast.error");
        },
      });
    },
  });

  return (
    <Credenza open={true} onOpenChange={props.closer}>
      <CredenzaContent>
        <form
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
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>
              <Button type="submit" variant="secondary" className="w-full">
                <GlobeIcon />
                <span>{t("dialog.import.url.submit")}</span>
              </Button>
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
  const { trackEvent } = useAptabase();

  // Handle Ctrl+V paste - uses native event to avoid permission prompts
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
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
        void trackEvent("import_from_clipboard");
        props.listener(text);
      }
    },
    [props, trackEvent],
  );

  return (
    <Credenza open={true} onOpenChange={props.closer}>
      <CredenzaContent>
        <div role="dialog" onPaste={handlePaste}>
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
                    onChange={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (!target.files) {
                        return;
                      }

                      for (let i = 0; i < target.files.length; i++) {
                        const file = target.files.item(i);
                        if (!file) {
                          continue;
                        }

                        const reader = new FileReader();
                        reader.onload = () => {
                          const data = reader.result as string;
                          props.listener(data);
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                )}
                <Button
                  variant="secondary"
                  className="flex-auto"
                  onClick={() => {
                    void trackEvent("import_from_file");
                    if (isDesktopApp()) {
                      runAsync(async () => {
                        const downloadsDir = await desktop.path.downloadDir();
                        const input = await desktop.dialog.open({
                          title: props.title,
                          filters: systemInfo?.mobile
                            ? undefined
                            : props.filters,
                          defaultPath: downloadsDir,
                          multiple: props.allowMultiple,
                          directory: false,
                        });
                        if (input === null) {
                          return;
                        }

                        const toParse: string[] = Array.isArray(input)
                          ? input
                          : [input];
                        for (const file of toParse) {
                          const data = await desktop.fs.readTextFile(file);

                          props.listener(data);
                        }
                      });
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
                    className="flex-auto"
                    onClick={props.openUrlDialog}
                  >
                    <GlobeIcon />
                    <span>{t("dialog.import.main.fromUrl")}</span>
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="flex-auto"
                  onClick={() => {
                    void trackEvent("import_from_clipboard");
                    runAsync(async () => {
                      if (isDesktopApp()) {
                        props.listener(
                          (await desktop.clipboard.readText()) ?? "",
                        );
                      } else {
                        const mimeTypes = props.filters.map((f) => f.mimeType);
                        const matcher = new MimeMatcher(...mimeTypes);
                        let clipboardEntries = (
                          await navigator.clipboard.read()
                        )
                          .map((item) => ({
                            item,
                            firstSupportedType: item.types.find((t) =>
                              matcher.match(t),
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
                        if (
                          !props.allowMultiple &&
                          clipboardEntries.length > 1
                        ) {
                          toast.warning(
                            t("dialog.import.main.firstClipboardItem"),
                          );
                          clipboardEntries = [clipboardEntries[0]];
                        }

                        for (const entry of clipboardEntries) {
                          const blob = await entry.item.getType(
                            entry.firstSupportedType,
                          );
                          props.listener(await blob.text());
                        }
                      }
                    });
                  }}
                >
                  <ClipboardIcon />
                  <span>{t("dialog.import.main.fromClipboard")}</span>
                </Button>
              </div>
              {props.textInput !== null && (
                <TextInput {...props} textInput={props.textInput} />
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
  const { trackEvent } = useAptabase();
  return (
    <>
      <Separator orientation="horizontal" />
      <div className="flex flex-col gap-4">
        <Textarea
          autoFocus
          placeholder={t("dialog.import.main.textarea.placeholder")}
          defaultValue={inputText}
          onChange={(e) => setInputText(e.currentTarget.value)}
        />
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            void trackEvent("import_from_text_input");
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
