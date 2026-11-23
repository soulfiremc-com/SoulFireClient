import {
  ExpandIcon,
  ExternalLinkIcon,
  Gamepad2Icon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import type { PovAudio } from "./use-pov-audio";

export function PovAudioControls({
  audio,
  available,
  playing,
}: {
  audio: PovAudio;
  /** True while a stream is connected that could carry audio. */
  available: boolean;
  playing: boolean;
}) {
  const { t } = useTranslation("instance");
  const volumeLabelId = useId();
  const { supported, enabled, starting } = audio;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!available || supported !== true}
        title={
          supported === null
            ? playing
              ? t("bots.pov.audioWaiting")
              : t("bots.pov.audioWatchFirst")
            : supported
              ? undefined
              : t("bots.pov.audioUpdateServer")
        }
        aria-label={
          enabled ? t("bots.pov.muteAudio") : t("bots.pov.unmuteAudio")
        }
        aria-pressed={enabled}
        onClick={() => void audio.toggle()}
      >
        {enabled ? <Volume2Icon /> : <VolumeXIcon />}
        {starting
          ? t("bots.pov.audioStarting")
          : enabled
            ? t("bots.pov.mute")
            : supported === null
              ? t("bots.pov.audio")
              : supported
                ? t("bots.pov.unmute")
                : t("bots.pov.audioUnavailable")}
      </Button>
      {enabled && (
        <Field className="w-24">
          <FieldLabel id={volumeLabelId} className="sr-only">
            {t("bots.pov.volume")}
          </FieldLabel>
          <Slider
            aria-labelledby={volumeLabelId}
            min={0}
            max={100}
            value={[audio.volume]}
            onValueChange={(value: number | readonly number[]) => {
              const next = typeof value === "number" ? value : value[0];
              if (next !== undefined) audio.changeVolume(next);
            }}
          />
        </Field>
      )}
    </div>
  );
}

export function PovToolbar({
  watching,
  canWatch,
  captured,
  canCapture,
  audioControls,
  onToggleWatch,
  onToggleCapture,
  onFullscreen,
  onDetach,
}: {
  watching: boolean;
  canWatch: boolean;
  captured: boolean;
  canCapture: boolean;
  audioControls: React.ReactNode;
  onToggleWatch: () => void;
  onToggleCapture: () => void;
  onFullscreen: () => void;
  onDetach: () => void;
}) {
  const { t } = useTranslation("instance");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="mr-auto text-sm font-medium">{t("bots.pov.title")}</h3>
      <Button
        size="sm"
        variant="outline"
        disabled={!canWatch}
        onClick={onToggleWatch}
      >
        {watching ? (
          <PauseIcon data-icon="inline-start" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        {watching ? t("bots.pov.stopWatching") : t("bots.pov.watch")}
      </Button>
      <Button
        size="sm"
        variant={captured ? "outline" : "default"}
        disabled={!captured && !canCapture}
        onClick={onToggleCapture}
      >
        <Gamepad2Icon data-icon="inline-start" />
        {captured ? t("bots.pov.release") : t("bots.pov.takeControl")}
      </Button>
      {audioControls}
      <Button
        size="sm"
        variant="ghost"
        onClick={onFullscreen}
        aria-label={t("bots.pov.fullscreen")}
      >
        <ExpandIcon />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDetach}>
        <ExternalLinkIcon data-icon="inline-start" />
        {t("bots.pov.detach")}
      </Button>
    </div>
  );
}
