import { useCallback, useEffect, useRef, useState } from "react";

interface ContextMenuState<T> {
  position: { x: number; y: number };
  data: T;
}

export function useContextMenu<T>() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T> | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault();
    e.stopPropagation();
    Object.assign(e.nativeEvent, { __entityContextMenu: true });
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, data });
  }, []);

  const dismiss = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        dismiss();
      }
    }

    function onScroll(e: Event) {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) {
        return;
      }
      dismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", dismiss);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", dismiss);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [contextMenu, dismiss]);

  return { contextMenu, handleContextMenu, dismiss, menuRef };
}
