import type { BotLifecycleKind } from "@/generated/soulfire/bot_live_pb";

export type FeedEntry = {
  id: number;
  /** Every bot that received this entry, in arrival order. */
  botNames: readonly string[];
  timestamp: Date;
} & (
  | { kind: "chat"; senderName?: string | undefined; text: string }
  | {
      kind: "lifecycle";
      lifecycleKind: BotLifecycleKind;
      message?: string | undefined;
    }
);

/** Bots on one server receive the same chat line within about this time. */
const DUPLICATE_WINDOW_MS = 5000;
/** How many recent entries a new chat line is compared against. */
const DUPLICATE_LOOKBACK = 50;

/**
 * Adds an entry to the feed buffer in place and keeps at most `max` entries.
 * A chat line that another bot already received in the last few seconds
 * joins that entry, so a fleet of bots shows one line per server message.
 * Each added or changed entry is a new object, so memoized rows still update.
 */
export function addFeedEntry(
  buffer: FeedEntry[],
  entry: FeedEntry,
  max: number,
): void {
  if (entry.kind === "chat") {
    const stop = Math.max(0, buffer.length - DUPLICATE_LOOKBACK);
    for (let index = buffer.length - 1; index >= stop; index -= 1) {
      const existing = buffer[index];
      if (
        existing === undefined ||
        entry.timestamp.getTime() - existing.timestamp.getTime() >
          DUPLICATE_WINDOW_MS
      ) {
        break;
      }
      if (
        existing.kind === "chat" &&
        existing.text === entry.text &&
        existing.senderName === entry.senderName
      ) {
        const newBots = entry.botNames.filter(
          (name) => !existing.botNames.includes(name),
        );
        // The same bot seeing the same line again is a new message.
        if (newBots.length === 0) break;
        buffer[index] = {
          ...existing,
          botNames: [...existing.botNames, ...newBots],
        };
        return;
      }
    }
  }
  buffer.push(entry);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
}
