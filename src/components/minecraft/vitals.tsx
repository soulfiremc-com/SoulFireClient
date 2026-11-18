import { DrumstickIcon, HeartIcon, type LucideIcon } from "lucide-react";
import { t } from "i18next";
import { cn } from "@/lib/utils.tsx";
import { generateN } from "@/lib/generate-n.ts";

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
  label,
  className,
}: {
  label: string;
  value: number;
  maxValue: number;
  units: number;
  Icon: LucideIcon;
  size: number;
  baseClassName: string;
  fillClassName: string;
  idPrefix: string;
  className?: string | undefined;
}) {
  const perUnit = maxValue / units;
  return (
    <span
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the icons and text form one labelled image
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
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
  className?: string | undefined;
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
      fillClassName="text-destructive"
      idPrefix="heart"
      label={`${t("instance:bots.statsPanel.health")}: ${Math.round(health)}/${Math.round(maxHealth)}`}
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
  className?: string | undefined;
}) {
  return (
    <Meter
      value={foodLevel}
      maxValue={20}
      units={10}
      Icon={DrumstickIcon}
      size={size}
      baseClassName="text-muted-foreground/25"
      fillClassName="text-warning"
      idPrefix="food"
      label={`${t("instance:bots.statsPanel.food")}: ${Math.round(foodLevel)}/20`}
      className={className}
    />
  );
}
