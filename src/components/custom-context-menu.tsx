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

function isEditableTarget(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement &&
        ![
          "button",
          "checkbox",
          "color",
          "file",
          "image",
          "radio",
          "range",
          "reset",
          "submit",
        ].includes(element.type)))
  );
}

export function CustomContextMenu() {
  const {
    contextMenu: menu,
    handleContextMenu,
    dismiss,
    menuRef,
  } = useContextMenu<string>();

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      if ("__entityContextMenu" in e && e.__entityContextMenu === true) return;

      const target = e.target instanceof Element ? e.target : null;
      // Keep the native cut, copy, and paste menu in text fields, and the
      // open and copy link actions on links.
      if (isEditableTarget(target) || target?.closest("a[href]")) {
        dismiss();
        return;
      }

      e.preventDefault();

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
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [dismiss, handleContextMenu]);

  if (!menu) return null;

  return (
    <ContextMenuPortal
      menuRef={menuRef}
      x={menu.position.x}
      y={menu.position.y}
      onClose={dismiss}
    >
      <SelectedTextActions text={menu.data} onClose={dismiss} />
    </ContextMenuPortal>
  );
}

export function SelectedTextActions({
  text,
  onClose,
}: {
  text: string;
  onClose: () => void;
}) {
  const copyToClipboard = useCopyToClipboard();
  const { t } = useTranslation("common");

  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          void copyToClipboard(text);
          onClose();
        }}
      >
        <ClipboardCopyIcon />
        {t("copyToClipboard")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          toast.promise(
            uploadToMcLogs(text).then((response) => {
              if (response.success) {
                void copyToClipboard(response.url);
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
          onClose();
        }}
      >
        <CloudUploadIcon />
        {t("uploadToMcLogs")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          openExternalUrl(
            `https://www.google.com/search?q=${encodeURIComponent(text)}`,
          );
          onClose();
        }}
      >
        <SearchIcon />
        {t("searchWithGoogle")}
      </DropdownMenuItem>
    </>
  );
}
