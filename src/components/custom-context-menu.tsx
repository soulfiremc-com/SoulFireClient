import { ClipboardCopyIcon, CloudUploadIcon, SearchIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ContextMenuPortal } from "@/components/context-menu-portal.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { useContextMenu } from "@/hooks/use-context-menu.ts";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard.ts";
import { openExternalUrl, uploadToMcLogs } from "@/lib/utils.tsx";

function hasSelectTextAncestor(element: Element | null): boolean {
  let current = element;
  while (current) {
    if (current.classList.contains("select-text")) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function CustomContextMenu() {
  const {
    contextMenu: menu,
    handleContextMenu,
    dismiss,
    menuRef,
  } = useContextMenu<string>();
  const copyToClipboard = useCopyToClipboard();
  const { t } = useTranslation("common");

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      if (
        "__entityContextMenu" in e &&
        (e as MouseEvent & { __entityContextMenu?: boolean })
          .__entityContextMenu
      )
        return;

      e.preventDefault();

      const target = e.target as Element | null;
      if (!target || !hasSelectTextAncestor(target)) {
        dismiss();
        return;
      }

      const selection = window.getSelection();
      const selectedText = selection?.toString() ?? "";
      if (selectedText.length === 0) {
        dismiss();
        return;
      }

      handleContextMenu(e, selectedText);
    }

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [dismiss, handleContextMenu]);

  if (!menu) return null;

  return (
    <ContextMenuPortal
      menuRef={menuRef}
      x={menu.position.x}
      y={menu.position.y}
      onClose={dismiss}
    >
      <DropdownMenuItem
        onClick={() => {
          copyToClipboard(menu.data);
          dismiss();
        }}
      >
        <ClipboardCopyIcon />
        {t("copyToClipboard")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          toast.promise(
            uploadToMcLogs(menu.data).then((response) => {
              if (response.success) {
                copyToClipboard(response.url);
                return response.url;
              }
              throw new Error(`Upload failed: ${response.error}`);
            }),
            {
              loading: t("mcLogsUpload.loading"),
              success: (url) => t("mcLogsUpload.success", { url }),
              error: t("mcLogsUpload.error"),
            },
          );
          dismiss();
        }}
      >
        <CloudUploadIcon />
        {t("uploadToMcLogs")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          openExternalUrl(
            `https://www.google.com/search?q=${encodeURIComponent(menu.data)}`,
          );
          dismiss();
        }}
      >
        <SearchIcon />
        {t("searchWithGoogle")}
      </DropdownMenuItem>
    </ContextMenuPortal>
  );
}
