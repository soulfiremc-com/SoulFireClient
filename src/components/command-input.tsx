import { createClient } from "@connectrpc/connect";
import type {
  CommandCompletion,
  CommandScope,
} from "@soulfiremc/sdk/generated/soulfire/command_pb";
import { CommandService } from "@soulfiremc/sdk/generated/soulfire/command_pb";
import {
  type KeyboardEventHandler,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd";

type CompletionState = {
  baseText: string;
  cursor: number;
  receivedCompletions: CommandCompletion[] | null;
  index: number | null;
  replacementRange: { start: number; end: number } | null;
};

const COMPLETION_DEBOUNCE_MS = 120;

const SF_COMMAND_HISTORY_KEY = "sf-command-history";
const SF_COMMAND_HISTORY_LENGTH = 100;

const historySchema = z.string().array();

const WHITESPACE_REGEX = /\s/;

function getTokenRange(
  text: string,
  cursor: number,
): { start: number; end: number } {
  let start = cursor;
  while (start > 0 && !WHITESPACE_REGEX.test(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = cursor;
  while (end < text.length && !WHITESPACE_REGEX.test(text[end] ?? "")) {
    end += 1;
  }

  return { start, end };
}

export default function CommandInput(props: { scope: CommandScope }) {
  const { t } = useTranslation("common");
  const transport = use(TransportContext);
  const [inputValue, setInputValue] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [commandHistory, setCommandHistory] = useState<string[]>(
    historySchema.parse(
      JSON.parse(localStorage.getItem(SF_COMMAND_HISTORY_KEY) ?? "[]"),
    ),
  );
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [completionState, setCompletionState] = useState<CompletionState>({
    baseText: "",
    cursor: 0,
    receivedCompletions: null,
    index: null,
    replacementRange: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const completionFetchTimeout = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [caretPositionStyle, setCaretPositionStyle] = useState<{
    left: number;
    top: number;
    inputBottom: number;
  } | null>(null);
  const activeSuggestionRef = useRef<HTMLLIElement | null>(null);
  const setActiveSuggestionNode = useCallback((node: HTMLLIElement | null) => {
    activeSuggestionRef.current = node;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        inputRef.current &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1 &&
        /[a-zA-Z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~ ]/.test(event.key) &&
        (activeEl === null ||
          (activeEl.tagName !== "INPUT" &&
            activeEl.tagName !== "TEXTAREA" &&
            !activeEl.isContentEditable))
      ) {
        inputRef.current.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const resetCompletionFetchDebounce = useCallback(() => {
    if (completionFetchTimeout.current !== null) {
      window.clearTimeout(completionFetchTimeout.current);
      completionFetchTimeout.current = null;
    }
  }, []);

  const fetchCompletions = useCallback(
    async (text: string, cursor: number) => {
      if (transport === null) {
        return;
      }

      const commandService = createClient(CommandService, transport);
      const response = await commandService.tabCompleteCommand({
        scope: props.scope,
        command: text,
        cursor,
      });

      const range = getTokenRange(text, cursor);
      setCompletionState({
        baseText: text,
        cursor,
        receivedCompletions: response.suggestions,
        index: null,
        replacementRange: range,
      });
    },
    [props.scope, transport],
  );

  const handleTabPress = async (
    text: string,
    cursor: number,
    element: HTMLInputElement,
    direction: 1 | -1,
  ) => {
    if (transport === null) {
      return;
    }

    let completionStateNew: CompletionState;
    if (
      completionState.receivedCompletions === null ||
      completionState.baseText !== text ||
      completionState.cursor !== cursor
    ) {
      const response = await createClient(
        CommandService,
        transport,
      ).tabCompleteCommand({
        scope: props.scope,
        command: text,
        cursor,
      });

      const range = getTokenRange(text, cursor);
      completionStateNew = {
        baseText: text,
        cursor,
        receivedCompletions: response.suggestions,
        index:
          response.suggestions.length > 0
            ? direction > 0
              ? 0
              : response.suggestions.length - 1
            : null,
        replacementRange: range,
      };
    } else if (completionState.receivedCompletions.length > 0) {
      const newIndex =
        completionState.index === null
          ? direction > 0
            ? 0
            : completionState.receivedCompletions.length - 1
          : (completionState.index +
              direction +
              completionState.receivedCompletions.length) %
            completionState.receivedCompletions.length;
      completionStateNew = {
        baseText: completionState.baseText,
        cursor: completionState.cursor,
        receivedCompletions: completionState.receivedCompletions,
        index: newIndex,
        replacementRange: completionState.replacementRange,
      };
    } else {
      completionStateNew = {
        baseText: text,
        cursor,
        receivedCompletions: [],
        index: null,
        replacementRange: getTokenRange(text, cursor),
      };
    }

    const suggestionsList = completionStateNew.receivedCompletions ?? [];
    if (suggestionsList.length > 0) {
      const activeIndex = completionStateNew.index ?? 0;
      const range =
        completionStateNew.replacementRange ??
        getTokenRange(completionStateNew.baseText, completionStateNew.cursor);
      const suggestion = suggestionsList[activeIndex]?.suggestion ?? "";

      const before = completionStateNew.baseText.slice(0, range.start);
      const after = completionStateNew.baseText.slice(
        completionStateNew.cursor,
      );
      const newValue = `${before}${suggestion}${after}`;
      const newCursor = before.length + suggestion.length;
      const newRange = { start: before.length, end: newCursor };

      setInputValue(newValue);
      requestAnimationFrame(() => {
        element.selectionStart = element.selectionEnd = newCursor;
        setCursorPosition(newCursor);
      });

      completionStateNew = {
        ...completionStateNew,
        baseText: newValue,
        cursor: newCursor,
        index: activeIndex,
        replacementRange: newRange,
      };
    } else {
      completionStateNew = {
        ...completionStateNew,
        baseText: text,
        cursor,
        replacementRange:
          completionStateNew.replacementRange ?? getTokenRange(text, cursor),
      };
    }

    setCompletionState(completionStateNew);
  };

  const scheduleCompletionFetch = useCallback(
    (text: string, cursor: number) => {
      resetCompletionFetchDebounce();
      completionFetchTimeout.current = window.setTimeout(() => {
        void fetchCompletions(text, cursor);
      }, COMPLETION_DEBOUNCE_MS);
    },
    [fetchCompletions, resetCompletionFetchDebounce],
  );

  const replacementRangeStart = completionState.replacementRange?.start ?? null;

  const updateCaretPosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const rect = input.getBoundingClientRect();
    const styles = window.getComputedStyle(input);
    const font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
    const measureCanvas = document.createElement("canvas");
    const context = measureCanvas.getContext("2d");
    if (!context) {
      return;
    }

    context.font = font;

    const inputValueCurrent = input.value;
    const anchorIndex = Math.min(
      replacementRangeStart !== null ? replacementRangeStart : cursorPosition,
      inputValueCurrent.length,
    );
    const textBeforeAnchor = inputValueCurrent.slice(0, anchorIndex);
    let textWidth = context.measureText(textBeforeAnchor).width;
    const letterSpacing = parseFloat(styles.letterSpacing);
    if (!Number.isNaN(letterSpacing) && letterSpacing !== 0) {
      textWidth += letterSpacing * textBeforeAnchor.length;
    }

    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const rawLeft = rect.left + paddingLeft + textWidth - input.scrollLeft;
    const clampedLeft = Math.min(Math.max(rawLeft, 8), window.innerWidth - 16);

    setCaretPositionStyle({
      left: clampedLeft,
      top: rect.top,
      inputBottom: rect.top + rect.height,
    });
  }, [cursorPosition, replacementRangeStart]);

  useEffect(() => {
    return () => {
      resetCompletionFetchDebounce();
    };
  }, [resetCompletionFetchDebounce]);

  useLayoutEffect(() => {
    if (!isFocused) {
      return;
    }

    updateCaretPosition();
  }, [isFocused, updateCaretPosition]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const handleWindowEvent = () => {
      updateCaretPosition();
    };

    window.addEventListener("resize", handleWindowEvent);
    window.addEventListener("scroll", handleWindowEvent, true);

    return () => {
      window.removeEventListener("resize", handleWindowEvent);
      window.removeEventListener("scroll", handleWindowEvent, true);
    };
  }, [isFocused, updateCaretPosition]);

  const suggestions = completionState.receivedCompletions ?? [];
  const hasSuggestions = suggestions.length > 0;
  const highlightedIndex = completionState.index ?? 0;
  const showSuggestions =
    isFocused &&
    (inputValue === "" || completionState.receivedCompletions !== null);

  useEffect(() => {
    if (!showSuggestions || !hasSuggestions) {
      activeSuggestionRef.current = null;
      return;
    }

    const node = activeSuggestionRef.current;
    if (node) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [showSuggestions, hasSuggestions]);

  const acceptCompletion = useCallback((index: number) => {
    const element = inputRef.current;
    if (!element) {
      return;
    }

    setCompletionState((prev) => {
      if (!prev.receivedCompletions || prev.receivedCompletions.length === 0) {
        return prev;
      }

      const normalizedIndex =
        ((index % prev.receivedCompletions.length) +
          prev.receivedCompletions.length) %
        prev.receivedCompletions.length;
      const range =
        prev.replacementRange ?? getTokenRange(prev.baseText, prev.cursor);
      const suggestion = prev.receivedCompletions[normalizedIndex].suggestion;
      const before = prev.baseText.slice(0, range.start);
      const after = prev.baseText.slice(prev.cursor);
      const newValue = `${before}${suggestion}${after}`;
      const newCursor = before.length + suggestion.length;
      const newRange = { start: before.length, end: newCursor };

      setInputValue(newValue);
      requestAnimationFrame(() => {
        element.selectionStart = element.selectionEnd = newCursor;
        setCursorPosition(newCursor);
      });

      return {
        ...prev,
        baseText: newValue,
        cursor: newCursor,
        index: normalizedIndex,
        replacementRange: newRange,
      };
    });
  }, []);

  const cycleSuggestion = useCallback(
    (delta: number) => {
      const entries = completionState.receivedCompletions;
      if (!entries || entries.length === 0) {
        return;
      }

      const nextIndex =
        completionState.index === null
          ? delta > 0
            ? 0
            : entries.length - 1
          : (completionState.index + delta + entries.length) % entries.length;

      acceptCompletion(nextIndex);
    },
    [acceptCompletion, completionState],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    const currentTarget = e.currentTarget;
    const caretPosition =
      currentTarget.selectionStart ?? currentTarget.value.length;
    const hasCyclableSuggestions =
      showSuggestions &&
      hasSuggestions &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey;

    if (e.key === "Enter") {
      e.preventDefault();

      const currentVal = currentTarget.value.trim();
      setInputValue("");
      setCompletionState({
        baseText: "",
        cursor: 0,
        receivedCompletions: null,
        index: null,
        replacementRange: null,
      });
      requestAnimationFrame(() => {
        currentTarget.selectionStart = currentTarget.selectionEnd = 0;
        setCursorPosition(0);
        scheduleCompletionFetch("", 0);
      });

      if (transport === null || currentVal === "") {
        return;
      }

      setCommandHistory((prev) => {
        if (prev[prev.length - 1] !== currentVal) {
          while (prev.length >= SF_COMMAND_HISTORY_LENGTH) {
            prev.shift();
          }

          const newHistory = [...prev, currentVal];
          localStorage.setItem(
            SF_COMMAND_HISTORY_KEY,
            JSON.stringify(newHistory),
          );
          return newHistory;
        }

        return prev;
      });
      setHistoryIndex(-1);

      const commandService = createClient(CommandService, transport);
      void commandService.executeCommand({
        scope: props.scope,
        command: currentVal,
      });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const direction: 1 | -1 = e.shiftKey ? -1 : 1;
      void handleTabPress(
        currentTarget.value,
        caretPosition,
        currentTarget,
        direction,
      );
      return;
    }

    if (
      hasCyclableSuggestions &&
      (e.key === "ArrowDown" || e.key === "ArrowUp")
    ) {
      e.preventDefault();
      cycleSuggestion(e.key === "ArrowDown" ? 1 : -1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();

      if (commandHistory.length === 0) {
        return;
      }

      if (historyIndex === -1) {
        setHistoryIndex(commandHistory.length - 1);
        const newValue = commandHistory[commandHistory.length - 1];
        setInputValue(newValue);
        setCompletionState({
          baseText: newValue,
          cursor: newValue.length,
          receivedCompletions: null,
          index: null,
          replacementRange: null,
        });
        requestAnimationFrame(() => {
          currentTarget.selectionStart = currentTarget.selectionEnd =
            newValue.length;
          setCursorPosition(newValue.length);
          scheduleCompletionFetch(newValue, newValue.length);
        });
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        const newValue = commandHistory[historyIndex - 1];
        setInputValue(newValue);
        setCompletionState({
          baseText: newValue,
          cursor: newValue.length,
          receivedCompletions: null,
          index: null,
          replacementRange: null,
        });
        requestAnimationFrame(() => {
          currentTarget.selectionStart = currentTarget.selectionEnd =
            newValue.length;
          setCursorPosition(newValue.length);
          scheduleCompletionFetch(newValue, newValue.length);
        });
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();

      if (commandHistory.length === 0) {
        return;
      }

      if (historyIndex === commandHistory.length - 1) {
        setHistoryIndex(-1);
        setInputValue("");
        setCompletionState({
          baseText: "",
          cursor: 0,
          receivedCompletions: null,
          index: null,
          replacementRange: null,
        });
        requestAnimationFrame(() => {
          currentTarget.selectionStart = currentTarget.selectionEnd = 0;
          setCursorPosition(0);
          scheduleCompletionFetch("", 0);
        });
      } else if (historyIndex >= 0) {
        setHistoryIndex(historyIndex + 1);
        const newValue = commandHistory[historyIndex + 1];
        setInputValue(newValue);
        setCompletionState({
          baseText: newValue,
          cursor: newValue.length,
          receivedCompletions: null,
          index: null,
          replacementRange: null,
        });
        requestAnimationFrame(() => {
          currentTarget.selectionStart = currentTarget.selectionEnd =
            newValue.length;
          setCursorPosition(newValue.length);
          scheduleCompletionFetch(newValue, newValue.length);
        });
      }
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        autoFocus
        placeholder={t("commandInput.placeholder")}
        value={inputValue}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          const { value, selectionStart } = e.currentTarget;
          setInputValue(value);
          const cursor = selectionStart ?? value.length;
          setCursorPosition(cursor);
          scheduleCompletionFetch(value, cursor);
          setCompletionState({
            baseText: value,
            cursor,
            receivedCompletions: null,
            index: null,
            replacementRange: null,
          });
        }}
        onKeyUp={(event) => {
          const position =
            event.currentTarget.selectionStart ??
            event.currentTarget.value.length;
          setCursorPosition(position);
        }}
        onClick={(event) => {
          const position =
            event.currentTarget.selectionStart ??
            event.currentTarget.value.length;
          setCursorPosition(position);
        }}
        onFocus={(event) => {
          const value = event.currentTarget.value;
          const position = event.currentTarget.selectionStart ?? value.length;
          setCursorPosition(position);
          setIsFocused(true);
          if (value === "") {
            resetCompletionFetchDebounce();
            void fetchCompletions(value, position);
          } else {
            scheduleCompletionFetch(value, position);
          }
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
      />
      {showSuggestions && caretPositionStyle && (
        <div
          className="border-border bg-popover text-popover-foreground fixed z-50 w-64 max-w-[min(18rem,calc(100vw-2rem))] rounded-md border shadow-md"
          style={{
            left: caretPositionStyle.left,
            top: caretPositionStyle.inputBottom + 8,
          }}
          role="listbox"
          onMouseDown={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {suggestions.length > 0 ? (
            <ul className="max-h-60 overflow-auto py-1 text-sm">
              {suggestions.map((suggestion, index) => {
                const isActive = index === highlightedIndex;
                return (
                  <li
                    key={`${suggestion.suggestion}-${suggestion.tooltip ?? ""}`}
                    className={`cursor-pointer px-3 py-2 transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    }`}
                    ref={isActive ? setActiveSuggestionNode : undefined}
                    onMouseEnter={() => {
                      setCompletionState((prev) => {
                        if (
                          !prev.receivedCompletions ||
                          prev.receivedCompletions.length === 0
                        ) {
                          return prev;
                        }
                        return {
                          ...prev,
                          index,
                        };
                      });
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      acceptCompletion(index);
                    }}
                  >
                    <div className="font-medium">{suggestion.suggestion}</div>
                    {suggestion.tooltip && (
                      <div className="text-muted-foreground text-xs">
                        {suggestion.tooltip}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-muted-foreground px-3 py-2 text-sm">
              {inputValue === "" ? (
                <>
                  {t("commandInput.emptySuggestionsPrefix", {
                    defaultValue: "Type to request suggestions or press",
                  })}{" "}
                  <Kbd>Tab</Kbd>.
                </>
              ) : (
                t("commandInput.noSuggestions", {
                  defaultValue: "No suggestions available.",
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
