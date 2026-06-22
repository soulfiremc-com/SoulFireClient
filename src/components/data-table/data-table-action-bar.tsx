"use client";

import type { ReactTable, RowData } from "@tanstack/react-table";
import { Loader, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { dataTableFeatures } from "@/lib/data-table-features";
import { cn } from "@/lib/utils";

interface DataTableActionBarProps<TData extends RowData>
  extends React.ComponentProps<typeof motion.div> {
  table: ReactTable<typeof dataTableFeatures, TData>;
  visible?: boolean;
  container?: Element | DocumentFragment | null;
}

function DataTableActionBar<TData extends RowData>({
  table,
  visible: visibleProp,
  container: containerProp,
  children,
  className,
  ...props
}: DataTableActionBarProps<TData>) {
  const [mounted, setMounted] = React.useState(false);

  React.useLayoutEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        table.toggleAllRowsSelected(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [table]);

  const container =
    containerProp ?? (mounted ? globalThis.document?.body : null);

  if (!container) return null;

  return ReactDOM.createPortal(
    <table.Subscribe
      selector={(state) => ({
        columnFilters: state.columnFilters,
        rowSelection: state.rowSelection,
      })}
    >
      {() => {
        const visible =
          visibleProp ?? table.getFilteredSelectedRowModel().rows.length > 0;

        return (
          <AnimatePresence>
            {visible && (
              <motion.div
                role="toolbar"
                aria-orientation="horizontal"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className={cn(
                  "bg-background text-foreground fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-md border p-2 shadow-sm",
                  className,
                )}
                {...props}
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        );
      }}
    </table.Subscribe>,
    container,
  );
}

interface DataTableActionBarActionProps
  extends React.ComponentProps<typeof Button> {
  tooltip?: string;
  isPending?: boolean;
}

function DataTableActionBarAction({
  size = "sm",
  tooltip,
  isPending,
  disabled,
  className,
  children,
  ...props
}: DataTableActionBarActionProps) {
  const trigger = (
    <Button
      variant="secondary"
      size={size}
      className={cn(
        "border-secondary bg-secondary/50 hover:bg-secondary/70 gap-1.5 border [&>svg]:size-3.5",
        size === "icon" ? "size-7" : "h-7",
        className,
      )}
      disabled={disabled || isPending}
      {...props}
    >
      {isPending ? <Loader className="animate-spin" /> : children}
    </Button>
  );

  if (!tooltip) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        sideOffset={6}
        className="bg-accent text-foreground border font-semibold dark:bg-zinc-900 [&>span]:hidden"
      >
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface DataTableActionBarSelectionProps<TData extends RowData> {
  table: ReactTable<typeof dataTableFeatures, TData>;
}

function DataTableActionBarSelection<TData extends RowData>({
  table,
}: DataTableActionBarSelectionProps<TData>) {
  const onClearSelection = React.useCallback(() => {
    table.toggleAllRowsSelected(false);
  }, [table]);
  const { t } = useTranslation("common");

  return (
    <div className="flex h-7 items-center rounded-md border pr-1 pl-2.5">
      <table.Subscribe
        selector={(state) => ({
          columnFilters: state.columnFilters,
          rowSelection: state.rowSelection,
        })}
      >
        {() => (
          <span className="text-xs whitespace-nowrap">
            {t("dataTable.selected", {
              count: table.getFilteredSelectedRowModel().rows.length,
            })}
          </span>
        )}
      </table.Subscribe>
      <Separator
        orientation="vertical"
        className="mr-1 ml-2 data-[orientation=vertical]:h-4"
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={onClearSelection}
            />
          }
        >
          <X className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent
          sideOffset={10}
          className="bg-accent text-foreground flex items-center gap-2 border px-2 py-1 font-semibold dark:bg-zinc-900 [&>span]:hidden"
        >
          <p>{t("dataTable.clearSelection")}</p>
          <Kbd className="bg-background text-foreground border font-mono text-[0.7rem] font-normal shadow-xs">
            <abbr title="Escape" className="no-underline">
              {t("dataTable.escape")}
            </abbr>
          </Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export {
  DataTableActionBar,
  DataTableActionBarAction,
  DataTableActionBarSelection,
};
