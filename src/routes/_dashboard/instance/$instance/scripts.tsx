import { createRpcClient } from "@/lib/rpc";
import { toFormSchema } from "@/lib/form-validation";
import { Effect, Schema } from "effect";

import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ClipboardCopyIcon,
  EditIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  WorkflowIcon,
  ZapIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { Suspense, use, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import InstancePageLayout from "@/components/nav/instance/instance-page-layout.tsx";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { ScriptInfo } from "@/generated/soulfire/script_pb";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { ScriptTemplatePicker } from "@/components/script-editor/ScriptTemplatePicker.tsx";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import i18n from "@/lib/i18n";
import { isPostHogConfigured } from "@/lib/posthog.ts";
import { resumeScript } from "@/lib/resume-script.ts";
import { staticRouteChrome } from "@/lib/route-title.ts";
import {
  nodeTypesQueryOptions,
  scriptListQueryOptions,
} from "@/lib/script-service.ts";
import {
  isTemplateSupported,
  SCRIPT_TEMPLATES,
  type ScriptTemplate,
  scriptTemplateToProto,
} from "@/lib/script-templates.ts";
import { timestampToDate } from "@/lib/utils.tsx";

const createScriptSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
});

function generateN(count: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => index + 1,
  );
}

export const Route = createFileRoute("/_dashboard/instance/$instance/scripts")({
  beforeLoad: () =>
    staticRouteChrome(() => i18n.t("common:pageName.instanceScripts"), {
      kind: "dynamic",
      name: "scroll-text",
    }),
  component: InstanceScripts,
});

function ScriptsPageSkeleton() {
  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      {/* Alert skeleton */}
      <div className="flex items-start gap-3 rounded-lg border p-4">
        <Skeleton className="size-5 shrink-0" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      {/* Script cards grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {generateN(3).map((item) => (
          <div key={item} className="rounded-lg border p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5" />
                  <Skeleton className="h-5 w-28" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="size-8" />
                <Skeleton className="size-8" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatLastModified(timestamp: ScriptInfo["updatedAt"]) {
  if (!timestamp) return "";

  const date = timestampToDate(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${diffDays}d ago`;
}

function InstanceScripts() {
  const { t } = useTranslation("common");

  return (
    <InstancePageLayout
      extraCrumbs={[
        {
          id: "controls",
          content: t("breadcrumbs.controls"),
        },
      ]}
      pageName={t("pageName.instanceScripts")}
      loadingSkeleton={<ScriptsPageSkeleton />}
    >
      <Content />
    </InstancePageLayout>
  );
}

function Content() {
  const { t } = useTranslation("common");
  const { t: tInstance } = useTranslation("instance");
  const posthog = usePostHog();
  const { instance: instanceId } = Route.useParams();
  const { instanceInfoQueryOptions } = Route.useRouteContext();
  const { data: instanceInfo } = useSuspenseQuery(instanceInfoQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const transport = use(TransportContext);

  // Fetch scripts from server
  const { data: scriptsData } = useSuspenseQuery(
    scriptListQueryOptions(transport, instanceId),
  );
  const scripts = scriptsData?.scripts ?? [];

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScriptInfo | null>(null);

  // Create script mutation
  const createMutation = useMutation({
    mutationKey: ["script", "create", instanceId],
    mutationFn: async (value: (typeof createScriptSchema)["Type"]) => {
      if (!transport) throw new Error("No transport available");
      const client = createRpcClient(ScriptService, transport);
      const result = await Effect.runPromise(
        client.createScript({
          instanceId,
          name: value.name.trim() || tInstance("scripts.untitledScript"),
          description: value.description.trim(),
          nodes: [],
          edges: [],
          paused: true,
        }),
      );
      return result;
    },
    onSuccess: (response) => {
      if (isPostHogConfigured) {
        posthog.capture("script_created");
      }
      toast.success(tInstance("scripts.createSuccess"));
      setIsCreateDialogOpen(false);
      if (response.script) {
        void navigate({
          to: "/instance/$instance/script/$scriptId",
          params: { instance: instanceId, scriptId: response.script.id },
        });
      }
    },
    onError: (error) => {
      console.error("Failed to create script:", error);
      toast.error(tInstance("scripts.createError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  // A template starts off so that nothing happens before the user reviews it.
  const templateMutation = useMutation({
    mutationKey: ["script", "create-template", instanceId],
    mutationFn: async (template: ScriptTemplate) => {
      if (!transport) throw new Error("No transport available");
      return Effect.runPromise(
        createRpcClient(ScriptService, transport).createScript({
          instanceId,
          name: tInstance(`scripts.templates.${template.id}.title`),
          description: tInstance(
            `scripts.templates.${template.id}.description`,
          ),
          ...scriptTemplateToProto(template),
          paused: true,
        }),
      );
    },
    onSuccess: (response) => {
      if (isPostHogConfigured) {
        posthog.capture("script_created", { source: "template" });
      }
      toast.success(tInstance("scripts.createSuccess"));
      if (response.script) {
        void navigate({
          to: "/instance/$instance/script/$scriptId",
          params: { instance: instanceId, scriptId: response.script.id },
        });
      }
    },
    onError: (error) => {
      console.error("Failed to create script:", error);
      toast.error(tInstance("scripts.createError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });
  const { data: nodeTypesData } = useQuery(nodeTypesQueryOptions(transport));
  const templates = useMemo(
    () =>
      SCRIPT_TEMPLATES.filter((template) =>
        isTemplateSupported(template, nodeTypesData?.nodeTypes ?? []),
      ),
    [nodeTypesData?.nodeTypes],
  );

  const form = useForm({
    defaultValues: {
      name: "",
      description: "",
    },
    validators: {
      onSubmit: toFormSchema(createScriptSchema),
    },
    onSubmit: async ({ value }) => {
      createMutation.mutate(value);
    },
  });

  // Delete script mutation
  const deleteMutation = useMutation({
    mutationKey: ["script", "delete", instanceId],
    mutationFn: async (scriptId: string) => {
      if (!transport) throw new Error("No transport available");
      const client = createRpcClient(ScriptService, transport);
      await Effect.runPromise(client.deleteScript({ instanceId, scriptId }));
    },
    onSuccess: () => {
      if (isPostHogConfigured) {
        posthog.capture("script_deleted");
      }
      toast.success(tInstance("scripts.deleteSuccess"));
    },
    onError: (error) => {
      console.error("Failed to delete script:", error);
      toast.error(tInstance("scripts.deleteError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  // Resume script mutation (unpause)
  const resumeMutation = useMutation({
    mutationKey: ["script", "resume", instanceId],
    mutationFn: async (scriptId: string) => {
      if (!transport) throw new Error("No transport available");
      await resumeScript(transport, instanceId, scriptId);
    },
    onSuccess: () => {
      if (isPostHogConfigured) {
        posthog.capture("script_resumed");
      }
      toast.success(tInstance("scripts.resumeSuccess"));
    },
    onError: (error) => {
      console.error("Failed to resume script:", error);
      toast.error(tInstance("scripts.resumeError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  // Pause script mutation
  const pauseMutation = useMutation({
    mutationKey: ["script", "pause", instanceId],
    mutationFn: async (scriptId: string) => {
      if (!transport) throw new Error("No transport available");
      const client = createRpcClient(ScriptService, transport);
      await Effect.runPromise(
        client.deactivateScript({ instanceId, scriptId }),
      );
    },
    onSuccess: () => {
      if (isPostHogConfigured) {
        posthog.capture("script_paused");
      }
      toast.success(tInstance("scripts.pauseSuccess"));
    },
    onError: (error) => {
      console.error("Failed to pause script:", error);
      toast.error(tInstance("scripts.pauseError"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["scripts", instanceId] });
    },
  });

  const { contextMenu, handleContextMenu, dismiss, menuRef } =
    useContextMenu<ScriptInfo>();
  const copyToClipboard = useCopyToClipboard();

  const handleDeleteScript = () => {
    if (!deleteTarget) {
      return;
    }

    deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleTogglePaused = (scriptId: string, isPaused: boolean) => {
    if (isPaused) {
      resumeMutation.mutate(scriptId);
    } else {
      pauseMutation.mutate(scriptId);
    }
  };

  return (
    <div className="container flex h-full w-full grow flex-col gap-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {tInstance("scripts.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tInstance("scripts.description")}
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger render={<Button className="gap-2" />}>
            <PlusIcon data-icon="inline-start" />
            {tInstance("scripts.createScript")}
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {tInstance("scripts.createScriptTitle")}
                </DialogTitle>
                <DialogDescription>
                  {tInstance("scripts.createScriptDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <form.Field name="name">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          {tInstance("scripts.scriptName")}
                        </FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={tInstance(
                            "scripts.scriptNamePlaceholder",
                          )}
                          aria-invalid={isInvalid}
                        />
                      </Field>
                    );
                  }}
                </form.Field>
                <form.Field name="description">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          {tInstance("scripts.scriptDescription")}
                        </FieldLabel>
                        <Textarea
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder={tInstance(
                            "scripts.scriptDescriptionPlaceholder",
                          )}
                          rows={3}
                          aria-invalid={isInvalid}
                        />
                      </Field>
                    );
                  }}
                </form.Field>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {tInstance("scripts.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <dl className="grid max-w-5xl gap-3 text-sm sm:grid-cols-3">
        {(["saved", "on", "run"] as const).map((term) => (
          <div key={term}>
            <dt className="font-medium">
              {tInstance(`scripts.lifecycle.${term}.term`)}
            </dt>
            <dd className="text-muted-foreground">
              {tInstance(`scripts.lifecycle.${term}.description`)}
            </dd>
          </div>
        ))}
      </dl>

      {/* Scripts Grid */}
      {scripts.length === 0 ? (
        <section
          aria-labelledby="script-first-use-title"
          className="flex max-w-3xl flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2 id="script-first-use-title" className="text-base font-semibold">
              {tInstance("scripts.noScripts")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {tInstance("scripts.noScriptsDescription")}
            </p>
          </div>
          {templates.length > 0 && (
            <ScriptTemplatePicker
              templates={templates}
              disabled={templateMutation.isPending}
              onPick={(template) => templateMutation.mutate(template)}
            />
          )}
          <Button
            variant="outline"
            className="w-fit"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <PlusIcon data-icon="inline-start" />
            {tInstance("scripts.createFirstScript")}
          </Button>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scripts.map((script) => (
            <Suspense
              key={script.id}
              fallback={<ScriptCardSkeleton script={script} />}
            >
              <ScriptCard
                script={script}
                instanceId={instanceInfo.id}
                onDelete={() => setDeleteTarget(script)}
                onTogglePaused={(isPaused) =>
                  handleTogglePaused(script.id, isPaused)
                }
                isDeleting={deleteMutation.isPending}
                onContextMenu={(e) => handleContextMenu(e, script)}
              />
            </Suspense>
          ))}
        </div>
      )}
      {contextMenu && (
        <ContextMenuPortal
          onClose={dismiss}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          menuRef={menuRef}
        >
          <DropdownMenuItem
            onClick={() => {
              void navigate({
                to: "/instance/$instance/script/$scriptId",
                params: {
                  instance: instanceId,
                  scriptId: contextMenu.data.id,
                },
              });
              dismiss();
            }}
          >
            <EditIcon />
            {tInstance("scripts.contextMenu.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              handleTogglePaused(contextMenu.data.id, contextMenu.data.paused);
              dismiss();
            }}
          >
            {contextMenu.data.paused ? <PlayIcon /> : <SquareIcon />}
            {contextMenu.data.paused
              ? tInstance("scripts.contextMenu.resume")
              : tInstance("scripts.contextMenu.pause")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.name);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tInstance("scripts.contextMenu.copyScriptName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              copyToClipboard(contextMenu.data.id);
              dismiss();
            }}
          >
            <ClipboardCopyIcon />
            {tInstance("scripts.contextMenu.copyScriptId")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDeleteTarget(contextMenu.data);
              dismiss();
            }}
          >
            <Trash2Icon />
            {tInstance("scripts.contextMenu.delete")}
          </DropdownMenuItem>
        </ContextMenuPortal>
      )}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete script?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently delete "${deleteTarget.name}". This action cannot be undone.`
                : "This will permanently delete the script. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteScript}
              disabled={deleteMutation.isPending}
            >
              {tInstance("scripts.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScriptCardSkeleton({ script }: { script: ScriptInfo }) {
  const { t: tInstance } = useTranslation("instance");

  return (
    <Card className="group relative transition-colors hover:bg-muted/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{script.name}</CardTitle>
          </div>
        </div>
        <CardDescription className="line-clamp-2">
          {script.description || tInstance("scripts.noDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatLastModified(script.updatedAt)}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled>
            <EditIcon data-icon="inline-start" />
            {tInstance("scripts.edit")}
          </Button>
          <Button variant="outline" size="icon" disabled>
            <PlayIcon className="size-4" />
          </Button>
          <Button variant="outline" size="icon" disabled>
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ScriptCardProps {
  script: ScriptInfo;
  instanceId: string;
  onDelete: () => void;
  onTogglePaused: (isPaused: boolean) => void;
  isDeleting: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}

function ScriptCard({
  script,
  instanceId,
  onDelete,
  onTogglePaused,
  isDeleting,
  onContextMenu,
}: ScriptCardProps) {
  const { t: tInstance } = useTranslation("instance");

  // Get paused state from script entity
  const isPaused = script.paused;

  return (
    <Card
      className="group relative transition-colors hover:bg-muted/50"
      onContextMenu={onContextMenu}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{script.name}</CardTitle>
          </div>
          {isPaused ? (
            <Badge variant="secondary">{tInstance("scripts.paused")}</Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-success/40 text-success-emphasis gap-1.5"
            >
              <ZapIcon aria-hidden="true" className="size-3" />
              {tInstance("scripts.running")}
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-2">
          {script.description || tInstance("scripts.noDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatLastModified(script.updatedAt)}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            nativeButton={false}
            render={
              <Link
                to="/instance/$instance/script/$scriptId"
                params={{ instance: instanceId, scriptId: script.id }}
              />
            }
          >
            <EditIcon data-icon="inline-start" />
            {tInstance("scripts.edit")}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onTogglePaused(isPaused)}
            title={
              isPaused
                ? tInstance("scripts.resume")
                : tInstance("scripts.pause")
            }
            aria-label={
              isPaused
                ? tInstance("scripts.resume")
                : tInstance("scripts.pause")
            }
          >
            {isPaused ? (
              <PlayIcon className="size-4" />
            ) : (
              <SquareIcon className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            title={tInstance("scripts.delete")}
            aria-label={tInstance("scripts.delete")}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
