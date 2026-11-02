import type { QueryClient } from "@tanstack/react-query";
import {
  BotConnectionPhase,
  type BotListEntry,
  type BotListResponse,
} from "@/generated/soulfire/bot_pb";

export const SUPPORT_REMINDER_KEY = "sf-support-reminder-v1";
const LEGACY_DISMISSED_KEY = "sf-support-dismissed-at";
const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderState = {
  firstUsedAt: number | null;
  activeDays: string[];
  hasSpawnedBot: boolean;
  lastShownAt: number | null;
  disabled: "never" | "supporter" | null;
};

function emptyState(): ReminderState {
  return {
    firstUsedAt: null,
    activeDays: [],
    hasSpawnedBot: false,
    lastShownAt: null,
    disabled: null,
  };
}

function isTimestamp(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0)
  );
}

function readState(storage: Storage | undefined): ReminderState {
  try {
    const saved: unknown = JSON.parse(
      storage?.getItem(SUPPORT_REMINDER_KEY) ?? "null",
    );
    if (saved && typeof saved === "object") {
      const state = saved as Partial<ReminderState>;
      if (
        isTimestamp(state.firstUsedAt) &&
        isTimestamp(state.lastShownAt) &&
        Array.isArray(state.activeDays) &&
        state.activeDays.length <= 3 &&
        state.activeDays.every(
          (day) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day),
        ) &&
        typeof state.hasSpawnedBot === "boolean" &&
        (state.disabled === null ||
          state.disabled === "never" ||
          state.disabled === "supporter")
      ) {
        return {
          ...state,
          activeDays: [...new Set(state.activeDays)],
        } as ReminderState;
      }
    }
    // Keep an old dismissal's cooldown without treating it as proof of use.
    const dismissedAt = Number(storage?.getItem(LEGACY_DISMISSED_KEY));
    if (Number.isFinite(dismissedAt) && dismissedAt > 0) {
      return { ...emptyState(), lastShownAt: dismissedAt };
    }
  } catch {
    // Missing or corrupt preferences must not cause a first-launch request.
  }
  return emptyState();
}

function sixMonthsAfter(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 6);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

export function createSupportReminder({
  storage,
  now = () => Date.now(),
}: {
  storage?: Storage;
  now?: () => number;
} = {}) {
  let state = readState(storage);
  const listeners = new Set<() => void>();

  function update(next: ReminderState) {
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    state = next;
    try {
      storage?.setItem(SUPPORT_REMINDER_KEY, JSON.stringify(state));
    } catch {
      // Preferences still apply in this app session when storage is unavailable.
    }
    listeners.forEach((listener) => listener());
  }

  function synchronize() {
    if (!storage) return;
    const saved = readState(storage);
    if (JSON.stringify(state) === JSON.stringify(saved)) return;
    state = saved;
    listeners.forEach((listener) => listener());
  }

  function recordUse() {
    if (state.disabled) return;
    const timestamp = now();
    const date = new Date(timestamp);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    update({
      ...state,
      firstUsedAt: state.firstUsedAt ?? timestamp,
      activeDays: [...new Set([...state.activeDays, day])].slice(0, 3),
    });
  }

  function observeBots(
    bots: readonly Pick<BotListEntry, "isOnline" | "connectionPhase">[],
  ) {
    if (state.disabled || state.hasSpawnedBot) return;
    if (
      bots.some(
        (bot) =>
          bot.isOnline && bot.connectionPhase === BotConnectionPhase.SPAWNED,
      )
    ) {
      update({ ...state, hasSpawnedBot: true });
    }
  }

  function isEligible() {
    const timestamp = now();
    return (
      !state.disabled &&
      state.firstUsedAt !== null &&
      timestamp - state.firstUsedAt >= 14 * DAY_MS &&
      state.activeDays.length >= 3 &&
      state.hasSpawnedBot &&
      (state.lastShownAt === null ||
        timestamp >= sixMonthsAfter(state.lastShownAt))
    );
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    synchronize,
    recordUse,
    observeBots,
    isEligible,
    markShown() {
      // Another tab may have shown or disabled the reminder since this visit began.
      synchronize();
      if (!isEligible()) return false;
      update({ ...state, lastShownAt: now() });
      return true;
    },
    dismiss(reason: "later" | "never" | "supporter") {
      synchronize();
      update({
        ...state,
        lastShownAt: now(),
        disabled: reason === "later" ? state.disabled : reason,
      });
    },
  };
}

export type SupportReminderController = ReturnType<
  typeof createSupportReminder
>;

export function watchSupportReminderBots(
  client: QueryClient,
  reminder: SupportReminderController,
) {
  // Ignore cached fleets, including demo data left over from a previous session.
  return client.getQueryCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.action.type === "success" &&
      event.query.queryKey[0] === "bot-status"
    ) {
      reminder.observeBots(
        (event.query.state.data as BotListResponse | undefined)?.bots ?? [],
      );
    }
  });
}
