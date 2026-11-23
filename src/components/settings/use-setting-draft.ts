import { type KeyboardEvent, useEffect, useState } from "react";
import { useCachedState } from "@/hooks/use-cached-state.ts";
import {
  DebouncedCommit,
  flushWhenPageHides,
  SETTING_SAVE_DELAY_MS,
} from "@/lib/debounced-commit.ts";

/**
 * Saves the latest edit once typing pauses, on unmount, and when the page is
 * hidden. React does not unmount on reload or window close, so hiding the
 * page sends a held edit before the pause would end.
 */
export function useDebouncedSave<T>() {
  // oxlint-disable-next-line react/hook-use-state -- Keep the lazily initialized value for the lifetime of the component.
  const [saver] = useState(() => new DebouncedCommit<T>(SETTING_SAVE_DELAY_MS));
  useEffect(() => flushWhenPageHides(saver), [saver]);
  return saver;
}

/** Saves a held edit on Enter, but not while an input method is composing. */
export function flushOnEnter(saver: { flush: () => void }) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) saver.flush();
  };
}

/**
 * Keeps the text a field shows apart from the stored value. The draft follows
 * the stored value only while the field is idle: not focused, with no save
 * waiting or in flight. A failed save then shows the stored value again.
 */
export function useSettingDraft<Draft, Value>(options: {
  value: Draft;
  commit: (value: Value) => void | Promise<void>;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [scheduled, setScheduled] = useState(false);
  const [draft, setDraft] = useCachedState(options.value, {
    shouldSync: !isFocused && pendingWrites === 0 && !scheduled,
  });
  const saver = useDebouncedSave<Value>();

  const save = async (value: Value) => {
    setScheduled(false);
    setPendingWrites((count) => count + 1);
    try {
      await options.commit(value);
    } catch {
      // The mutation reports the failure and reloads the stored value.
    } finally {
      setPendingWrites((count) => count - 1);
    }
  };

  return {
    draft,
    busy: pendingWrites > 0 || scheduled,
    /**
     * Shows the edited draft and saves `value` once typing pauses. Pass
     * `undefined` for a draft that cannot be saved: the field then keeps the
     * stored value instead of an earlier valid prefix.
     */
    edit: (nextDraft: Draft, value: Value | undefined) => {
      setDraft(nextDraft);
      if (value === undefined) {
        saver.cancel();
        setScheduled(false);
        return;
      }
      setScheduled(true);
      saver.schedule(value, (next) => void save(next));
    },
    onFocus: () => {
      setIsFocused(true);
    },
    onBlur: () => {
      setIsFocused(false);
      saver.flush();
    },
    onKeyDown: flushOnEnter(saver),
  };
}
