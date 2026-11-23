import { type RefObject, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PovFrame } from "@/generated/soulfire/pov_pb";
import { PovAudioPlayer } from "@/lib/pov-audio-player";
import type { PovSession } from "@/lib/pov-session";

export type PovAudio = ReturnType<typeof usePovAudio>;

export function usePovAudio(sessionRef: RefObject<PovSession | null>) {
  const { t } = useTranslation("instance");
  const playerRef = useRef<PovAudioPlayer | null>(null);
  const generation = useRef(0);
  const startingAbort = useRef<AbortController | null>(null);
  const supportedRef = useRef<boolean | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [volume, setVolume] = useState(80);

  const mute = useCallback(() => {
    generation.current++;
    startingAbort.current?.abort();
    startingAbort.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    setEnabled(false);
    setStarting(false);
    sessionRef.current?.audio(false);
  }, [sessionRef]);

  // A new stream may come from a server without audio support.
  const reset = useCallback(() => {
    playerRef.current?.reset();
    supportedRef.current = null;
    setSupported(null);
  }, []);

  const accept = useCallback(
    (frame: PovFrame) => {
      if (supportedRef.current === null) {
        const next = frame.audioEnabled !== undefined;
        supportedRef.current = next;
        setSupported(next);
      }
      if (frame.audioError && playerRef.current) {
        mute();
        toast.error(frame.audioError);
      }
      playerRef.current?.accept(frame.audio);
    },
    [mute],
  );

  async function toggle() {
    if (playerRef.current || starting) {
      mute();
      return;
    }
    const current = ++generation.current;
    setStarting(true);
    const abort = new AbortController();
    startingAbort.current = abort;
    try {
      const player = await PovAudioPlayer.create(
        volume / 100,
        (reason) => {
          if (current !== generation.current) return;
          mute();
          toast.error(reason.message);
        },
        abort.signal,
      );
      if (current !== generation.current || !sessionRef.current) {
        player.close();
        return;
      }
      playerRef.current = player;
      setEnabled(true);
      sessionRef.current.audio(true);
    } catch (reason) {
      if (current === generation.current)
        toast.error(
          reason instanceof Error
            ? reason.message
            : t("instance:bots.pov.audioError"),
        );
    } finally {
      if (current === generation.current) {
        startingAbort.current = null;
        setStarting(false);
      }
    }
  }

  function changeVolume(next: number) {
    setVolume(next);
    playerRef.current?.volume(next / 100);
  }

  return {
    supported,
    enabled,
    starting,
    volume,
    changeVolume,
    toggle,
    mute,
    reset,
    accept,
  };
}
