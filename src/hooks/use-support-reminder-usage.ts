import { useQueryClient } from "@tanstack/react-query";
import { use, useEffect } from "react";
import { TransportContext } from "@/components/providers/transport-context";
import { supportReminder } from "@/lib/local-support-reminder";
import {
  SUPPORT_REMINDER_KEY,
  watchSupportReminderBots,
} from "@/lib/support-reminder";

export function useSupportReminderUsage(userId: string, enabled: boolean) {
  const transport = use(TransportContext);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !userId || !transport) return;
    supportReminder.synchronize();
    const recordUse = () => {
      if (document.visibilityState === "visible") supportReminder.recordUse();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === SUPPORT_REMINDER_KEY)
        supportReminder.synchronize();
    };
    recordUse();
    document.addEventListener("pointerdown", recordUse);
    document.addEventListener("keydown", recordUse);
    document.addEventListener("visibilitychange", recordUse);
    window.addEventListener("storage", onStorage);
    const unwatch = watchSupportReminderBots(queryClient, supportReminder);
    return () => {
      unwatch();
      document.removeEventListener("pointerdown", recordUse);
      document.removeEventListener("keydown", recordUse);
      document.removeEventListener("visibilitychange", recordUse);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, queryClient, transport, userId]);
}
