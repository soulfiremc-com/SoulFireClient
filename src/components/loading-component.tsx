import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { generateN } from "@/lib/generate-n.ts";

// Random width between 75 and 114 percent of the maximum width.
function randomSkeletonWidth() {
  return `${Math.floor(Math.random() * 40) + 75}%`;
}

function LoadingSkeleton() {
  const [width] = React.useState(randomSkeletonWidth);

  return (
    <Skeleton
      className="h-6 max-w-(--skeleton-width)"
      style={{
        "--skeleton-width": width,
      }}
    />
  );
}

export function LoadingComponent() {
  return (
    <div className="flex size-full grow flex-col gap-4 p-4">
      {generateN(10).map((slot) => (
        <LoadingSkeleton key={slot} />
      ))}
    </div>
  );
}
