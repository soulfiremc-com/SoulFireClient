import { Link } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import {
  ArrowLeftIcon,
  CircleHelpIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  SaveIcon,
  Undo2Icon,
  UploadIcon,
  ZapIcon,
} from "lucide-react";
import { ScriptHealthButton } from "./ScriptHealthButton";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { ImportReadSession, readImportFile } from "@/lib/import-read";
import { parseScriptFile, serializeScriptFile } from "@/lib/script-file";
import { cn } from "@/lib/utils.tsx";
import { ComplexityScore } from "./ComplexityScore";
import { DryRunDialog } from "./DryRunDialog";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";
import { QuotasDialog } from "./QuotasDialog";
import { ScriptDiffDialog } from "./ScriptDiffDialog";

function ScriptLifecycleHelp() {
  const { t } = useTranslation("instance");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("scripts.lifecycle.title")}
          />
        }
      >
        <CircleHelpIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        <PopoverHeader>
          <PopoverTitle>{t("scripts.lifecycle.title")}</PopoverTitle>
        </PopoverHeader>
        <dl className="flex flex-col gap-2 text-sm">
          {(["saved", "on", "run", "test"] as const).map((term) => (
            <div key={term}>
              <dt className="font-medium">
                {t(`scripts.lifecycle.${term}.term`)}
              </dt>
              <dd className="text-muted-foreground">
                {t(`scripts.lifecycle.${term}.description`)}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

interface ScriptToolbarProps {
  instanceId: string;
  onSave?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  isSaving?: boolean;
  isControlling?: boolean;
  className?: string;
}

export function ScriptToolbar({
  instanceId,
  onSave,
  onStart,
  onStop,
  isSaving = false,
  isControlling = false,
  className,
}: ScriptToolbarProps) {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const isMobile = useIsMobile();
  const scriptName = useSelector(editor.document, (state) => state.scriptName);
  const setScriptName = editor.actions.setScriptName;
  const isDirty = useSelector(editor.document, (state) => state.isDirty);
  const paused = useSelector(editor.document, (state) => state.paused);
  const loadScriptData = editor.actions.loadScriptData;
  const nodeCount = useSelector(editor.document, (state) => state.nodes.length);
  const canUndo = useSelector(editor.history, (state) => state.past.length > 0);
  const canRedo = useSelector(
    editor.history,
    (state) => state.future.length > 0,
  );
  const hasErrors = useSelector(editor.validation, (state) =>
    state.validationDiagnostics.some((item) => item.severity === "error"),
  );

  // A new script has no name until someone gives it one.
  const displayName = scriptName || t("scripts.untitledScript");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(scriptName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [readSession] = useState(() => new ImportReadSession());
  useEffect(
    () => () => {
      readSession.cancel();
    },
    [readSession],
  );

  const handleExport = () => {
    const blob = new Blob(
      [serializeScriptFile(editor.actions.getScriptData())],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${displayName.replaceAll(/[^a-zA-Z0-9]/gu, "_")}.soulfire-script.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast.success(t("scripts.editor.toolbar.exportSuccess"));
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";

    try {
      await readSession.run(
        async (signal) => [await readImportFile(file, signal)],
        ([content]) => {
          if (content === undefined) return;
          const importData = parseScriptFile(content);
          const current = editor.document.get();
          loadScriptData({
            nodes: importData.nodes,
            edges: importData.edges,
            name: importData.name ?? current.scriptName,
            description: importData.description ?? current.scriptDescription,
            // A file without a run state keeps this script's current one.
            paused: importData.paused ?? current.paused,
            quotas: importData.quotas,
          });
          toast.success(t("scripts.editor.toolbar.importSuccess"));
        },
      );
    } catch {
      toast.error(t("scripts.editor.toolbar.importError"));
    }
  };

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (editedName.trim() && editedName !== scriptName) {
      setScriptName(editedName.trim());
    } else {
      setEditedName(scriptName);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setEditedName(scriptName);
    }
  };

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-2 border-b border-border bg-card px-3",
        isMobile ? "h-12" : "min-h-12 flex-wrap py-2",
        className,
      )}
    >
      {/* Back Button */}
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={
          <Link
            to="/instance/$instance/scripts"
            params={{ instance: instanceId }}
          />
        }
      >
        <ArrowLeftIcon className="size-4" />
        <span className="sr-only">
          {t("scripts.editor.toolbar.backToScripts")}
        </span>
      </Button>

      {!isMobile && (
        <Separator orientation="vertical" className="my-auto h-6" />
      )}

      {/* Script Name */}
      <div className="flex min-w-0 items-center gap-2">
        {isEditingName ? (
          <Input
            value={editedName}
            onChange={(e) => {
              setEditedName(e.target.value);
            }}
            onBlur={handleNameSubmit}
            onKeyDown={handleNameKeyDown}
            aria-label={t("scripts.editor.toolbar.scriptName")}
            placeholder={t("scripts.untitledScript")}
            className={cn(
              "h-7 text-sm font-medium",
              isMobile ? "w-24" : "w-48",
            )}
            autoFocus
          />
        ) : (
          <button
            type="button"
            title={displayName}
            onClick={() => {
              setIsEditingName(true);
              setEditedName(scriptName);
            }}
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-sm px-2 py-1 text-sm font-medium transition-colors hover:bg-muted",
              isMobile ? "max-w-24" : "max-w-48",
            )}
          >
            <span className="truncate">{displayName}</span>
            {isDirty && (
              <span
                className="shrink-0 text-muted-foreground"
                title={t("scripts.editor.toolbar.unsavedChanges")}
              >
                *
              </span>
            )}
          </button>
        )}
        {!isMobile && isDirty && !isEditingName && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {t("scripts.editor.toolbar.unsaved")}
          </Badge>
        )}
        {!isMobile && <ComplexityScore />}
      </div>

      {!isMobile && (
        <Separator orientation="vertical" className="my-auto h-6" />
      )}

      {!isMobile && (
        <ButtonGroup>
          <Button
            variant="ghost"
            size="icon"
            onClick={editor.actions.undo}
            disabled={!canUndo}
            title={t("scripts.editor.toolbar.undo")}
            aria-label={t("scripts.editor.toolbar.undo")}
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={editor.actions.redo}
            disabled={!canRedo}
            title={t("scripts.editor.toolbar.redo")}
            aria-label={t("scripts.editor.toolbar.redo")}
          >
            <Redo2Icon className="size-4" />
          </Button>
        </ButtonGroup>
      )}

      {/* Save Button + Diff (diff hidden on mobile) */}
      {!isMobile && <ScriptDiffDialog />}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size={isMobile ? "icon" : "sm"}
              aria-label={t("scripts.editor.toolbar.save")}
              onClick={onSave}
              disabled={isSaving || !isDirty}
              className={cn(!isMobile && "gap-1.5")}
            />
          }
        >
          {isSaving ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          {!isMobile && t("scripts.editor.toolbar.save")}
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("scripts.editor.toolbar.saveTooltip")}</p>
        </TooltipContent>
      </Tooltip>

      {!isMobile && (
        <Separator orientation="vertical" className="my-auto h-6" />
      )}

      {/* A saved script only reacts to triggers while it is on. */}
      <div className="flex items-center gap-1">
        {!isMobile && <ScriptHealthButton />}
        {paused ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size={isMobile ? "icon" : "sm"}
                  aria-label={t("scripts.editor.toolbar.resume")}
                  onClick={onStart}
                  disabled={
                    isControlling || hasErrors || isDirty || nodeCount === 0
                  }
                />
              }
            >
              <PlayIcon data-icon="inline-start" />
              {!isMobile && t("scripts.editor.toolbar.resume")}
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isDirty
                  ? t("scripts.editor.toolbar.resumeSaveFirst")
                  : hasErrors
                    ? t("scripts.editor.toolbar.resumeBlocked")
                    : t("scripts.editor.toolbar.resumeTooltip")}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size={isMobile ? "icon" : "sm"}
                    aria-label={t("scripts.editor.toolbar.pause")}
                    onClick={onStop}
                    disabled={isControlling}
                  />
                }
              >
                <PauseIcon data-icon="inline-start" />
                {!isMobile && t("scripts.editor.toolbar.pause")}
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("scripts.editor.toolbar.pauseTooltip")}</p>
              </TooltipContent>
            </Tooltip>
            {!isMobile && (
              <Badge
                variant="outline"
                className="gap-1.5 border-success/40 text-success-emphasis"
              >
                <ZapIcon aria-hidden="true" className="size-3" />
                {t("scripts.running")}
              </Badge>
            )}
          </>
        )}
        {!isMobile && <ScriptLifecycleHelp />}
        <DryRunDialog instanceId={instanceId} />
        {!isMobile && <QuotasDialog />}
      </div>

      <div className="flex-1" />

      {isMobile ? (
        /* Mobile: Overflow dropdown menu */
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("scripts.editor.toolbar.actions")}
                />
              }
            >
              <EllipsisVerticalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={editor.actions.undo}
                  disabled={!canUndo}
                >
                  <Undo2Icon />
                  {t("scripts.editor.toolbar.undo")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={editor.actions.redo}
                  disabled={!canRedo}
                >
                  <Redo2Icon />
                  {t("scripts.editor.toolbar.redo")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={handleExport}>
                  <DownloadIcon />
                  {t("scripts.editor.toolbar.export")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon />
                  {t("scripts.editor.toolbar.import")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.soulfire-script.json"
            onChange={(event) => void handleImport(event)}
            className="hidden"
          />
        </>
      ) : (
        /* Desktop: Full toolbar */
        <>
          {/* Export/Import */}
          <ButtonGroup>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("scripts.editor.toolbar.export")}
                    onClick={handleExport}
                  />
                }
              >
                <DownloadIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("scripts.editor.toolbar.export")}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("scripts.editor.toolbar.import")}
                    onClick={() => fileInputRef.current?.click()}
                  />
                }
              >
                <UploadIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("scripts.editor.toolbar.import")}</p>
              </TooltipContent>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.soulfire-script.json"
              onChange={(event) => void handleImport(event)}
              className="hidden"
            />
          </ButtonGroup>

          <KeyboardShortcutsHelp />
        </>
      )}
    </div>
  );
}
