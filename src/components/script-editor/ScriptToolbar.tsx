import { Link } from "@tanstack/react-router";
import { useSelector } from "@tanstack/react-store";
import {
  ArrowLeftIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LoaderCircleIcon,
  PauseIcon,
  PlayIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
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
import { QuotasDialog } from "./QuotasDialog";
import { ScriptDiffDialog } from "./ScriptDiffDialog";

interface ScriptToolbarProps {
  instanceId: string;
  onSave?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onClear?: () => void;
  isSaving?: boolean;
  isControlling?: boolean;
  className?: string;
}

export function ScriptToolbar({
  instanceId,
  onSave,
  onStart,
  onStop,
  onZoomIn,
  onZoomOut,
  onFitView,
  onClear,
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

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(scriptName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readSession] = useState(() => new ImportReadSession());
  useEffect(() => () => readSession.cancel(), [readSession]);

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
    a.download = `${scriptName.replace(/[^a-z0-9]/gi, "_")}.soulfire-script.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
          const importData = parseScriptFile(content);
          const current = editor.document.get();
          loadScriptData({
            nodes: importData.nodes,
            edges: importData.edges,
            name: importData.name ?? current.scriptName,
            description: importData.description ?? current.scriptDescription,
            paused: importData.paused ?? false,
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
        <Separator orientation="vertical" className="h-6 my-auto" />
      )}

      {/* Script Name */}
      <div className="flex items-center gap-2 min-w-0">
        {isEditingName ? (
          <Input
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleNameKeyDown}
            className={cn(
              "h-7 text-sm font-medium",
              isMobile ? "w-24" : "w-48",
            )}
            autoFocus
          />
        ) : (
          <button
            type="button"
            title={scriptName}
            onClick={() => {
              setIsEditingName(true);
              setEditedName(scriptName);
            }}
            className={cn(
              "flex min-w-0 items-center gap-1 rounded px-2 py-1 text-sm font-medium transition-colors hover:bg-muted",
              isMobile ? "max-w-24" : "max-w-48",
            )}
          >
            <span className="truncate">{scriptName}</span>
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
        <Separator orientation="vertical" className="h-6 my-auto" />
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
        <Separator orientation="vertical" className="h-6 my-auto" />
      )}

      {/* Execution Controls */}
      <div className="flex items-center gap-1">
        {paused ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size={isMobile ? "icon" : "sm"}
                  aria-label={t("scripts.editor.toolbar.resume")}
                  onClick={onStart}
                  disabled={isControlling}
                  className={cn(!isMobile && "gap-1.5")}
                />
              }
            >
              <PlayIcon className="size-4" />
              {!isMobile && t("scripts.editor.toolbar.resume")}
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("scripts.editor.toolbar.resumeTooltip")}</p>
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
                    className={cn(!isMobile && "gap-1.5")}
                  />
                }
              >
                <PauseIcon className="size-4" />
                {!isMobile && t("scripts.editor.toolbar.pause")}
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("scripts.editor.toolbar.pauseTooltip")}</p>
              </TooltipContent>
            </Tooltip>
            {!isMobile && (
              <Badge variant="default" className="gap-1.5 bg-success-strong">
                <div className="size-2 animate-pulse rounded-full bg-white" />
                {t("scripts.running")}
              </Badge>
            )}
          </>
        )}
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
                <DropdownMenuItem onClick={handleExport}>
                  <DownloadIcon />
                  {t("scripts.editor.toolbar.export")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon />
                  {t("scripts.editor.toolbar.import")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onZoomIn}>
                  <ZoomInIcon />
                  {t("scripts.editor.toolbar.zoomIn")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onZoomOut}>
                  <ZoomOutIcon />
                  {t("scripts.editor.toolbar.zoomOut")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onFitView}>
                  {t("scripts.editor.toolbar.fit")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {onClear && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={onClear}>
                      <Trash2Icon />
                      {t("scripts.editor.toolbar.clearCanvas")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.soulfire-script.json"
            onChange={handleImport}
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
              onChange={handleImport}
              className="hidden"
            />
          </ButtonGroup>

          <Separator orientation="vertical" className="h-6 my-auto" />

          {/* Clear Button */}
          {onClear && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("scripts.editor.toolbar.clearCanvas")}
                      onClick={onClear}
                    />
                  }
                >
                  <Trash2Icon className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("scripts.editor.toolbar.clearCanvas")}</p>
                </TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-6 my-auto" />
            </>
          )}

          {/* Zoom Controls */}
          <ButtonGroup>
            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomOut}
              title={t("scripts.editor.toolbar.zoomOut")}
            >
              <ZoomOutIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onZoomIn}
              title={t("scripts.editor.toolbar.zoomIn")}
            >
              <ZoomInIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onFitView}
              className="text-xs"
            >
              {t("scripts.editor.toolbar.fit")}
            </Button>
          </ButtonGroup>
        </>
      )}
    </div>
  );
}
