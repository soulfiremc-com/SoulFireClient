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
import { CANVAS_SHORTCUTS, canvasShortcutKeys } from "./canvas-shortcuts";

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
          <p className="text-xs text-muted-foreground">
            {t("scripts.editor.shortcuts.description")}
          </p>
        </PopoverHeader>
        <ScrollArea className="h-72">
          <dl className="flex flex-col gap-1.5 pr-3 text-xs">
            {CANVAS_SHORTCUTS.map(({ id, mouse }) => (
              <div key={id} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t(`scripts.editor.shortcuts.actions.${id}`)}
                </dt>
                <dd>
                  <Kbd className="font-mono">
                    {[
                      canvasShortcutKeys(id, formatShortcut),
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
