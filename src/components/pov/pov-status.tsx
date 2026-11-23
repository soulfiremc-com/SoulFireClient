import {
  EyeIcon,
  Gamepad2Icon,
  LoaderCircleIcon,
  PlayIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PovOfflineStatus } from "./bot-pov-player";
import { POV_RELEASE_SHORTCUT } from "./use-pov-capture";

/** Covers the view with the next step while the user does not control the bot. */
export function PovStatusOverlay({
  error,
  demo,
  isOnline,
  offlineStatus,
  playing,
  capturePending,
  connected,
  captureError,
  onReconnect,
  onWatch,
  onCapture,
}: {
  error: string | null;
  demo: boolean;
  isOnline: boolean;
  offlineStatus: PovOfflineStatus | undefined;
  playing: boolean;
  capturePending: boolean;
  connected: boolean;
  captureError: string | null;
  onReconnect: () => void;
  onWatch: () => void;
  onCapture: () => void;
}) {
  const { t } = useTranslation("instance");
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
      {error ? (
        <div className="flex max-w-md flex-col items-center gap-3 p-4 text-center">
          <p role="alert">{error}</p>
          {!demo && (
            <Button onClick={onReconnect}>
              <RefreshCwIcon data-icon="inline-start" />
              {t("bots.pov.reconnect")}
            </Button>
          )}
        </div>
      ) : !isOnline ? (
        <output className="flex max-w-md flex-col items-center gap-2 p-4 text-center">
          <p className="flex items-center gap-2">
            {offlineStatus?.waiting && (
              <LoaderCircleIcon
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin"
              />
            )}
            {offlineStatus?.message ?? t("bots.pov.offline")}
          </p>
          {offlineStatus?.detail && (
            <p className="font-mono text-xs wrap-break-word opacity-80 select-text">
              {offlineStatus.detail}
            </p>
          )}
        </output>
      ) : !playing ? (
        <Button onClick={onWatch}>
          <PlayIcon data-icon="inline-start" />
          {t("bots.pov.watchBot")}
        </Button>
      ) : capturePending ? (
        <p>{t("bots.pov.capturing")}</p>
      ) : !connected ? (
        <p>{t("bots.pov.connecting")}</p>
      ) : (
        <button
          type="button"
          onClick={onCapture}
          className="absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <span className={buttonVariants()}>
            <Gamepad2Icon data-icon="inline-start" />
            {t("bots.pov.takeControl")}
          </span>
          {captureError && (
            <span className="absolute inset-x-4 bottom-4 text-center text-sm text-muted-foreground">
              {captureError}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/** Tells a user in control that input waits for the stream to come back. */
export function PovReconnectingBadge() {
  const { t } = useTranslation("instance");
  return (
    <output className="pointer-events-none absolute top-2 left-2 z-10">
      <Badge variant="secondary">
        <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
        {t("bots.pov.reconnecting")}
      </Badge>
    </output>
  );
}

export function PovStatusLine({
  touch,
  captured,
  watching,
}: {
  touch: boolean;
  captured: boolean;
  /** True while a stream is connected. */
  watching: boolean;
}) {
  const { t } = useTranslation("instance");
  return (
    <output
      className={`flex items-center gap-2 text-xs ${captured ? "font-medium" : "text-muted-foreground"}`}
    >
      {captured ? (
        <Gamepad2Icon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <EyeIcon aria-hidden="true" className="size-3.5 shrink-0" />
      )}
      <span>
        {touch
          ? captured
            ? t("bots.pov.touchControlling")
            : t("bots.pov.touchHint")
          : captured
            ? t("bots.pov.controlling", { shortcut: POV_RELEASE_SHORTCUT })
            : watching
              ? t("bots.pov.watching", { shortcut: POV_RELEASE_SHORTCUT })
              : t("bots.pov.idle")}
      </span>
    </output>
  );
}
