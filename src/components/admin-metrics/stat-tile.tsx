import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/// A grid of compact stat tiles. Children are `StatTile`s.
export function StatTileGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
      {children}
    </dl>
  );
}

export function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-lg font-semibold tabular-nums">
        {value}
      </dd>
      {detail !== undefined && (
        <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
      )}
    </div>
  );
}

export function StatTileSkeleton() {
  return <Skeleton className="h-16 w-full rounded-lg" />;
}
