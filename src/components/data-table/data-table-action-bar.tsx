"use client";

import i18n from "@/lib/i18n.ts";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { Loader, X } from "lucide-react";
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

const ESCAPE_LAYER_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-slot="popover-content"]';

interface DataTableActionBarProps<
  TData extends RowData,
> extends React.ComponentProps<"div"> {
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
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape inside a dialog, menu, or popover closes that layer only.
      if (
        event.target instanceof Element &&
        event.target.closest(ESCAPE_LAYER_SELECTOR)
      ) {
        return;
      }
      table.toggleAllRowsSelected(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [table]);

  const container =
    containerProp ?? (mounted ? globalThis.document.body : null);

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
          <DataTableActionBarPresence
            visible={visible}
            className={className}
            {...props}
          >
            {children}
          </DataTableActionBarPresence>
        );
      }}
    </table.Subscribe>,
    container,
  );
}

interface DataTableActionBarPresenceProps extends React.ComponentProps<"div"> {
  visible: boolean;
}

// Keeps the bar mounted until its exit animation ends.
function DataTableActionBarPresence({
  visible,
  className,
  onAnimationEnd,
  ...props
}: DataTableActionBarPresenceProps) {
  const [rendered, setRendered] = React.useState(visible);
  if (visible && !rendered) setRendered(true);
  if (!rendered) return null;

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      aria-hidden={visible ? undefined : true}
      data-state={visible ? "open" : "closed"}
      onAnimationEnd={(event) => {
        onAnimationEnd?.(event);
        if (!visible && event.target === event.currentTarget) {
          setRendered(false);
        }
      }}
      className={cn(
        "fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-md border bg-background p-2 text-foreground shadow-sm duration-200 ease-in-out data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-5 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-5 motion-reduce:animate-none data-[state=closed]:motion-reduce:hidden",
        className,
      )}
      {...props}
    />
  );
}

interface DataTableActionBarActionProps extends React.ComponentProps<
  typeof Button
> {
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
        "gap-1.5 border border-secondary bg-secondary/50 hover:bg-secondary/70 [&>svg]:size-3.5",
        size === "icon" ? "size-7" : "h-7",
        className,
      )}
      disabled={disabled || isPending}
      aria-label={tooltip}
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
        className="border bg-accent font-semibold text-foreground dark:bg-card [&>span]:hidden"
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
              className="size-6"
              aria-label={t("dataTable.clearSelection")}
              aria-keyshortcuts="Escape"
              onClick={onClearSelection}
            />
          }
        >
          <X className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent
          sideOffset={10}
          className="flex items-center gap-2 border bg-accent px-2 py-1 font-semibold text-foreground dark:bg-card [&>span]:hidden"
        >
          <p>{t("dataTable.clearSelection")}</p>
          <Kbd className="border bg-background font-mono text-2xs font-normal text-foreground shadow-xs">
            <abbr
              title={i18n.t("common:dataTable.escapeKey")}
              className="no-underline"
            >
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
