import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { type ReactNode, type RefObject, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { contextMenuClassName } from "@/components/context-menu-primitives.tsx";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu.tsx";
import { cn } from "@/lib/utils.tsx";

export function ContextMenuPortal({
  x,
  y,
  menuRef,
  onClose,
  children,
}: {
  x: number;
  y: number;
  menuRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        DOMRect.fromRect({ x, y, width: 0, height: 0 }),
    }),
    [x, y],
  );

  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuPortal>
        <MenuPrimitive.Positioner
          anchor={anchor}
          positionMethod="fixed"
          side="bottom"
          align="start"
          collisionPadding={8}
          collisionAvoidance={{
            side: "shift",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup
            ref={menuRef}
            aria-label={t("contextMenu.actions")}
            className={cn(
              contextMenuClassName,
              "max-h-[calc(100dvh-1rem)] max-w-[calc(100dvw-1rem)] overflow-y-auto outline-none",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                onClose();
              }
            }}
          >
            <DropdownMenuGroup>{children}</DropdownMenuGroup>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
