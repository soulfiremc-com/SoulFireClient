import { EyeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BotPanel, BotPanelEmpty } from "@/components/bot-view/bot-panel.tsx";
import type { BotLiveState } from "@/generated/soulfire/bot_pb";
import { formatFixed } from "@/lib/format.ts";
import { isOneOf } from "@/lib/is-one-of";

const VANILLA_DIMENSIONS = ["overworld", "the_nether", "the_end"] as const;

/** Names vanilla dimensions in the active language and shows other IDs as they are. */
function formatDimension(
  dimension: string,
  t: (key: string) => string,
): string {
  const id = dimension.replace(/^minecraft:/u, "");
  return isOneOf(id, VANILLA_DIMENSIONS)
    ? t(`bots.visualPanel.dimensions.${id}`)
    : dimension;
}

// Minecraft yaw 0 faces south and increases clockwise toward west.
const COMPASS_DIRECTIONS = [
  "s",
  "sw",
  "w",
  "nw",
  "n",
  "ne",
  "e",
  "se",
] as const;

const getCompassDirection = (yaw: number) => {
  const normalizedYaw = ((yaw % 360) + 360) % 360;
  return COMPASS_DIRECTIONS[Math.round(normalizedYaw / 45) % 8] ?? "s";
};

/** Shows where the bot faces and which dimension it is in. */
export function BotVisualPanel({
  liveState,
}: {
  liveState?: BotLiveState | undefined;
}) {
  const { t } = useTranslation("instance");

  return (
    <BotPanel icon={EyeIcon} title={t("bots.visualPanel.title")}>
      {liveState ? (
        <BotVisualDetails liveState={liveState} />
      ) : (
        <BotPanelEmpty>{t("bots.visualPanel.offline")}</BotPanelEmpty>
      )}
    </BotPanel>
  );
}

function BotVisualDetails({ liveState }: { liveState: BotLiveState }) {
  const { t } = useTranslation("instance");

  return (
    <div className="flex flex-col gap-4">
      {/* Compass and Look direction side by side on desktop */}
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-8">
        {/* Compass */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {t("bots.visualPanel.compass")}
          </p>
          <div className="relative size-32">
            {/* Compass background */}
            <div className="absolute inset-0 rounded-full border-2 border-border bg-muted/30" />
            {/* Cardinal directions */}
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground">
              {t("bots.visualPanel.directions.n")}
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold text-muted-foreground">
              {t("bots.visualPanel.directions.s")}
            </span>
            <span className="absolute top-1/2 left-1 -translate-y-1/2 text-xs font-bold text-muted-foreground">
              {t("bots.visualPanel.directions.w")}
            </span>
            <span className="absolute top-1/2 right-1 -translate-y-1/2 text-xs font-bold text-muted-foreground">
              {t("bots.visualPanel.directions.e")}
            </span>
            {/* Direction indicator */}
            <div
              className="absolute bottom-1/2 left-1/2 h-12 w-1 origin-bottom -translate-x-1/2 rotate-(--compass-yaw)"
              style={{ "--compass-yaw": `${liveState.yRot + 180}deg` }}
            >
              <div className="size-full rounded-full bg-primary" />
              <div className="absolute -top-1 left-1/2 size-0 -translate-x-1/2 border-4 border-transparent border-b-primary" />
            </div>
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 size-3 -translate-1/2 rounded-full bg-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold select-text">
              {t(
                `bots.visualPanel.directions.${getCompassDirection(liveState.yRot)}`,
              )}
            </p>
            <p className="text-xs text-muted-foreground select-text">
              {formatFixed(liveState.yRot, 1)}°
            </p>
          </div>
        </div>

        {/* Look direction (pitch) */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {t("bots.visualPanel.lookDirection")}
          </p>
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-4 overflow-hidden rounded-full bg-muted/30">
              {/* Pitch indicator */}
              <div
                className="absolute inset-x-0 top-(--look-pitch) h-2 -translate-y-1/2 rounded-full bg-primary transition-all"
                // Pitch runs from -90 (up) to 90 (down), so -90 maps to 0%.
                style={{
                  "--look-pitch": `${((liveState.xRot + 90) / 180) * 100}%`,
                }}
              />
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">
                {liveState.xRot < -30
                  ? t("bots.visualPanel.lookingUp")
                  : liveState.xRot > 30
                    ? t("bots.visualPanel.lookingDown")
                    : t("bots.visualPanel.lookingStraight")}
              </p>
              <p className="text-xs text-muted-foreground select-text">
                {formatFixed(liveState.xRot, 1)}°
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* World info */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
          {t("bots.visualPanel.worldInfo")}
        </p>
        <div className="text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("bots.visualPanel.dimension")}:
            </span>{" "}
            <span className="font-mono select-text">
              {liveState.dimension
                ? formatDimension(liveState.dimension, t)
                : t("bots.statsPanel.unknown")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
