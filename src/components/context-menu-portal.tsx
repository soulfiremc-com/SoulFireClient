import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ContextMenuContainer } from "@/components/context-menu-primitives.tsx";

export function ContextMenuPortal({
  x,
  y,
  menuRef,
  children,
}: {
  x: number;
  y: number;
  menuRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const updatePosition = () => {
      const viewport = document.documentElement;
      const next = {
        x: Math.max(
          8,
          Math.min(x, viewport.clientWidth - menu.offsetWidth - 8),
        ),
        y: Math.max(
          8,
          Math.min(y, viewport.clientHeight - menu.offsetHeight - 8),
        ),
      };
      setPosition((current) =>
        current.x === next.x && current.y === next.y ? current : next,
      );
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(menu);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [x, y, menuRef]);

  return createPortal(
    <ContextMenuContainer
      menuRef={menuRef}
      className="fixed z-50 max-h-[calc(100dvh-1rem)] max-w-[calc(100dvw-1rem)] overflow-y-auto"
      style={{ left: position.x, top: position.y }}
    >
      {children}
    </ContextMenuContainer>,
    document.body,
  );
}
