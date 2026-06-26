import { useId, useMemo } from "react";
import { Area, AreaChart } from "recharts";
import { ChartContainer } from "@/components/ui/chart.tsx";
import { cn } from "@/lib/utils.tsx";

/// A minimal area sparkline: no axes, grid, legend or tooltip. Renders a
/// single series from a list of numbers, scaling to fill its container.
export function Sparkline({
  data,
  color = "var(--chart-1)",
  className,
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const chartData = useMemo(
    () => data.map((value, index) => ({ index, value })),
    [data],
  );

  return (
    <ChartContainer
      config={{}}
      className={cn("aspect-auto h-8 w-full", className)}
    >
      <AreaChart
        data={chartData}
        margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
