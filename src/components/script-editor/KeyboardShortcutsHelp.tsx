import { KeyboardIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatShortcut } from "@/lib/platform.ts";

type MouseInput = "drag" | "rightClick";

const SHORTCUTS: ReadonlyArray<{
  id: string;
  keys: string;
  mouse?: MouseInput;
}> = [
  { id: "quickAdd", keys: "Shift + A" },
  { id: "quickAddAtCursor", keys: "", mouse: "rightClick" },
  { id: "selectAll", keys: "A" },
  { id: "deselectAll", keys: "Alt + A" },
  { id: "selectLinked", keys: "L" },
  { id: "selectUpstream", keys: "Ctrl + L" },
  { id: "selectDownstream", keys: "Alt + L" },
  { id: "selectSimilar", keys: "Shift + S" },
  { id: "duplicate", keys: "Shift + D" },
  { id: "copy", keys: "Ctrl + C" },
  { id: "paste", keys: "Ctrl + V" },
  { id: "undo", keys: "Ctrl + Z" },
  { id: "redo", keys: "Ctrl + Shift + Z" },
  { id: "delete", keys: "Delete / Backspace / X" },
  { id: "rename", keys: "F2" },
  { id: "mute", keys: "M" },
  { id: "collapse", keys: "H" },
  { id: "hideSockets", keys: "Ctrl + H" },
  { id: "preview", keys: "Shift + H" },
  { id: "group", keys: "Ctrl + G" },
  { id: "ungroup", keys: "Ctrl + Alt + G" },
  { id: "enterGroup", keys: "Tab" },
  { id: "frame", keys: "Ctrl + J" },
  { id: "align", keys: "Ctrl + Shift + ←↑↓→" },
  { id: "distribute", keys: "Alt + Shift + H/V" },
  { id: "cutLinks", keys: "Alt", mouse: "drag" },
  { id: "reroute", keys: "Shift", mouse: "rightClick" },
];

/** Lists the canvas shortcuts. They work while the canvas has focus. */
export function KeyboardShortcutsHelp() {
  const { t } = useTranslation("instance");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("scripts.editor.shortcuts.title")}
          />
        }
      >
        <KeyboardIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t("scripts.editor.shortcuts.title")}</PopoverTitle>
          <p className="text-muted-foreground text-xs">
            {t("scripts.editor.shortcuts.description")}
          </p>
        </PopoverHeader>
        <ScrollArea className="h-72">
          <dl className="flex flex-col gap-1.5 pr-3 text-xs">
            {SHORTCUTS.map(({ id, keys, mouse }) => (
              <div key={id} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t(`scripts.editor.shortcuts.actions.${id}`)}
                </dt>
                <dd>
                  <Kbd className="font-mono">
                    {[
                      keys && formatShortcut(keys),
                      mouse && t(`scripts.editor.shortcuts.mouse.${mouse}`),
                    ]
                      .filter(Boolean)
                      .join(" + ")}
                  </Kbd>
                </dd>
              </div>
            ))}
          </dl>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
