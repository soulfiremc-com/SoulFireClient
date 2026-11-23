import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  PencilIcon,
  TrashIcon,
  UngroupIcon,
  UnplugIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu.tsx";
import { formatShortcut } from "@/lib/platform.ts";
import { type CanvasShortcutId, canvasShortcutKeys } from "./canvas-shortcuts";

function shortcutKeys(id: CanvasShortcutId) {
  return canvasShortcutKeys(id, formatShortcut, true);
}

interface NodeContextMenuProps {
  nodeId: string;
  isMuted?: boolean;
  isCollapsed?: boolean;
  previewEnabled?: boolean;
  supportsMuting?: boolean;
  supportsPreview?: boolean;
  isGroup?: boolean;
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onRename?: (nodeId: string) => void;
  onDisconnectAll?: (nodeId: string) => void;
  onToggleMute?: (nodeId: string) => void;
  onToggleCollapse?: (nodeId: string) => void;
  onTogglePreview?: (nodeId: string) => void;
  onOpenGroup?: (nodeId: string) => void;
  onUngroup?: (nodeId: string) => void;
}

export function NodeContextMenu({
  nodeId,
  isMuted = false,
  isCollapsed = false,
  previewEnabled = false,
  supportsMuting = true,
  supportsPreview = true,
  isGroup = false,
  onDelete,
  onDuplicate,
  onRename,
  onDisconnectAll,
  onToggleMute,
  onToggleCollapse,
  onTogglePreview,
  onOpenGroup,
  onUngroup,
}: NodeContextMenuProps) {
  const { t } = useTranslation("instance");

  return (
    <>
      {isGroup && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => onOpenGroup?.(nodeId)}>
              <LayersIcon />
              {t("scripts.editor.contextMenu.openGroup")}
              <DropdownMenuShortcut>
                {shortcutKeys("enterGroup")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUngroup?.(nodeId)}>
              <UngroupIcon />
              {t("scripts.editor.contextMenu.ungroup")}
              <DropdownMenuShortcut>
                {shortcutKeys("ungroup")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => {
            onDuplicate?.(nodeId);
          }}
        >
          <CopyIcon />
          {t("scripts.editor.contextMenu.duplicate")}
          <DropdownMenuShortcut>
            {shortcutKeys("duplicate")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onRename?.(nodeId);
          }}
        >
          <PencilIcon />
          {t("scripts.editor.contextMenu.rename")}
          <DropdownMenuShortcut>{shortcutKeys("rename")}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onDisconnectAll?.(nodeId);
          }}
        >
          <UnplugIcon />
          {t("scripts.editor.contextMenu.disconnectAll")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => {
            onToggleCollapse?.(nodeId);
          }}
        >
          {isCollapsed ? <ChevronDownIcon /> : <ChevronRightIcon />}
          {isCollapsed
            ? t("scripts.editor.contextMenu.expand")
            : t("scripts.editor.contextMenu.collapse")}
          <DropdownMenuShortcut>
            {shortcutKeys("collapse")}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        {supportsMuting && (
          <DropdownMenuItem
            onClick={() => {
              onToggleMute?.(nodeId);
            }}
          >
            {isMuted ? <VolumeIcon /> : <VolumeOffIcon />}
            {isMuted
              ? t("scripts.editor.contextMenu.unmute")
              : t("scripts.editor.contextMenu.mute")}
            <DropdownMenuShortcut>{shortcutKeys("mute")}</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {supportsPreview && (
          <DropdownMenuItem
            onClick={() => {
              onTogglePreview?.(nodeId);
            }}
          >
            {previewEnabled ? <EyeOffIcon /> : <EyeIcon />}
            {previewEnabled
              ? t("scripts.editor.contextMenu.hidePreview")
              : t("scripts.editor.contextMenu.showPreview")}
            <DropdownMenuShortcut>
              {shortcutKeys("preview")}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            onDelete?.(nodeId);
          }}
        >
          <TrashIcon />
          {t("scripts.editor.contextMenu.delete")}
          <DropdownMenuShortcut>{shortcutKeys("delete")}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
