import { DrumstickIcon, HeartIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils.tsx";

function generateN(count: number) {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    (_, index) => index + 1,
  );
}

/// A single meter icon (e.g. a heart) rendered as an empty base with a
/// horizontally clipped filled overlay, so half-filled units render cleanly.
function MeterIcon({
  Icon,
  fill,
  size,
  baseClassName,
  fillClassName,
}: {
  Icon: LucideIcon;
  fill: number;
  size: number;
  baseClassName: string;
  fillClassName: string;
}) {
  const clamped = Math.min(1, Math.max(0, fill));
  return (
    <span
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      <Icon
        className={cn("absolute inset-0", baseClassName)}
        style={{ width: size, height: size }}
        strokeWidth={2}
      />
      {clamped > 0 && (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${clamped * 100}%` }}
        >
          <Icon
            className={fillClassName}
            style={{ width: size, height: size }}
            fill="currentColor"
            strokeWidth={2}
          />
        </span>
      )}
    </span>
  );
}

function Meter({
  value,
  maxValue,
  units,
  Icon,
  size,
  baseClassName,
  fillClassName,
  idPrefix,
  className,
}: {
  value: number;
  maxValue: number;
  units: number;
  Icon: LucideIcon;
  size: number;
  baseClassName: string;
  fillClassName: string;
  idPrefix: string;
  className?: string;
}) {
  const perUnit = maxValue / units;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {generateN(units).map((unit) => {
        const fill = (value - (unit - 1) * perUnit) / perUnit;
        return (
          <MeterIcon
            key={`${idPrefix}-${unit}`}
            Icon={Icon}
            fill={fill}
            size={size}
            baseClassName={baseClassName}
            fillClassName={fillClassName}
          />
        );
      })}
    </span>
  );
}

/// Renders a Minecraft style hearts bar. Each heart represents 2 health points.
export function HeartsBar({
  health,
  maxHealth = 20,
  size = 14,
  className,
}: {
  health: number;
  maxHealth?: number;
  size?: number;
  className?: string;
}) {
  const units = Math.min(10, Math.max(1, Math.ceil(maxHealth / 2)));
  return (
    <Meter
      value={health}
      maxValue={units * 2}
      units={units}
      Icon={HeartIcon}
      size={size}
      baseClassName="text-muted-foreground/25"
      fillClassName="text-red-500"
      idPrefix="heart"
      className={className}
    />
  );
}

/// Renders a Minecraft style food bar. Each drumstick represents 2 food points.
export function FoodBar({
  foodLevel,
  size = 14,
  className,
}: {
  foodLevel: number;
  size?: number;
  className?: string;
}) {
  return (
    <Meter
      value={foodLevel}
      maxValue={20}
      units={10}
      Icon={DrumstickIcon}
      size={size}
      baseClassName="text-muted-foreground/25"
      fillClassName="text-amber-500"
      idPrefix="food"
      className={className}
    />
  );
}
