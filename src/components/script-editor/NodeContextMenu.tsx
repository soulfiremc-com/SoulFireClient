import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  TrashIcon,
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

interface NodeContextMenuProps {
  nodeId: string;
  isMuted?: boolean;
  isCollapsed?: boolean;
  previewEnabled?: boolean;
  supportsMuting?: boolean;
  supportsPreview?: boolean;
  onDelete?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onRename?: (nodeId: string) => void;
  onDisconnectAll?: (nodeId: string) => void;
  onToggleMute?: (nodeId: string) => void;
  onToggleCollapse?: (nodeId: string) => void;
  onTogglePreview?: (nodeId: string) => void;
}

export function NodeContextMenu({
  nodeId,
  isMuted = false,
  isCollapsed = false,
  previewEnabled = false,
  supportsMuting = true,
  supportsPreview = true,
  onDelete,
  onDuplicate,
  onRename,
  onDisconnectAll,
  onToggleMute,
  onToggleCollapse,
  onTogglePreview,
}: NodeContextMenuProps) {
  const { t } = useTranslation("instance");

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => {
            onDuplicate?.(nodeId);
          }}
        >
          <CopyIcon />
          {t("scripts.editor.contextMenu.duplicate")}
          <DropdownMenuShortcut>Shift+D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onRename?.(nodeId);
          }}
        >
          <PencilIcon />
          {t("scripts.editor.contextMenu.rename")}
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>H</DropdownMenuShortcut>
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
            <DropdownMenuShortcut>M</DropdownMenuShortcut>
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
            <DropdownMenuShortcut>Shift+H</DropdownMenuShortcut>
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
          <DropdownMenuShortcut>Del / X</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
