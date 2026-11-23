import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format.ts";
import { cn } from "@/lib/utils.tsx";

export interface ChartBreakdownItem {
  id: string;
  label: ReactNode;
  value: number;
  /** Background utility that matches the slice color, such as `bg-chart-1`. */
  swatchClassName: string;
}

/// Lists each chart slice as text, so the data does not depend on color or hover.
export function ChartBreakdown({
  items,
  className,
}: {
  items: ChartBreakdownItem[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.id} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-xs", item.swatchClassName)}
          />
          <dt className="min-w-0 truncate text-muted-foreground">
            {item.label}
          </dt>
          <dd className="font-medium tabular-nums">
            {formatNumber(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
