import { ConnectError, createClient } from "@connectrpc/connect";
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
import { toast } from "sonner";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Kbd } from "@/components/ui/kbd";
import type {
  CommandCompletion,
  CommandScope,
} from "@/generated/soulfire/command_pb";
import { CommandService } from "@/generated/soulfire/command_pb";
import { CommandCompletionRequest } from "@/lib/command-completion-request";
import {
  appendCommandHistory,
  readCommandHistory,
  saveCommandHistory,
  navigateCommandHistory,
  type CommandHistoryPosition,
} from "@/lib/command-history";

type CompletionState = {
  baseText: string;
  cursor: number;
  receivedCompletions: CommandCompletion[] | null;
  index: number | null;
  replacementRange: { start: number; end: number } | null;
};

const COMPLETION_DEBOUNCE_MS = 120;

const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "summary",
  "dialog",
  "audio[controls]",
  "video[controls]",
  ...[
    "alertdialog",
    "button",
    "checkbox",
    "combobox",
    "dialog",
    "grid",
    "gridcell",
    "link",
    "listbox",
    "menu",
    "menubar",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "radio",
    "radiogroup",
    "scrollbar",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "tablist",
    "textbox",
    "tree",
    "treegrid",
    "treeitem",
  ].map((role) => `[role~="${role}"]`),
].join(",");

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
  const [inputValue, setInputValueState] = useState("");
  const inputRevision = useRef(0);
  const setInputValue = useCallback((value: string) => {
    inputRevision.current++;
    setInputValueState(value);
  }, []);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [commandHistory, setCommandHistory] = useState(readCommandHistory);
  const [historyPosition, setHistoryPosition] =
    useState<CommandHistoryPosition>({ index: -1, draft: "" });
  const [completionState, setCompletionState] = useState<CompletionState>({
    baseText: "",
    cursor: 0,
    receivedCompletions: null,
    index: null,
    replacementRange: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [completionRequest] = useState(() => new CommandCompletionRequest());
  useLayoutEffect(() => {
    const cursor = pendingCaret.current;
    pendingCaret.current = null;
    if (cursor !== null) inputRef.current?.setSelectionRange(cursor, cursor);
  }, [inputValue, cursorPosition]);
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
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1 &&
        /[a-zA-Z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~ ]/.test(event.key) &&
        (activeEl === null ||
          (!activeEl.closest(INTERACTIVE_SELECTOR) &&
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
    async (
      text: string,
      cursor: number,
      accept: (state: CompletionState) => void = setCompletionState,
    ) => {
      if (transport === null) return;
      try {
        const result = await completionRequest.run(async (signal) => {
          const response = await createClient(
            CommandService,
            transport,
          ).tabCompleteCommand(
            { scope: props.scope, command: text, cursor },
            { signal },
          );
          return response.suggestions;
        });
        const input = inputRef.current;
        if (
          !result ||
          result.signal.aborted ||
          !input ||
          input.ownerDocument.activeElement !== input ||
          input.value !== text ||
          input.selectionStart !== cursor
        )
          return;
        accept({
          baseText: text,
          cursor,
          receivedCompletions: result.suggestions,
          index: null,
          replacementRange: getTokenRange(text, cursor),
        });
      } catch (error) {
        console.error("Could not load command completions", error);
      }
    },
    [completionRequest, props.scope, transport],
  );

  const handleTabPress = async (
    text: string,
    cursor: number,
    element: HTMLInputElement,
    direction: 1 | -1,
  ) => {
    resetCompletionFetchDebounce();
    completionRequest.cancel();
    const applyCompletions = (completionStateNew: CompletionState) => {
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

        setHistoryPosition({ index: -1, draft: "" });
        setInputValue(newValue);
        pendingCaret.current = newCursor;
        setCursorPosition(newCursor);

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

    if (transport === null) {
      return;
    }

    let completionStateNew: CompletionState;
    if (
      completionState.receivedCompletions === null ||
      completionState.baseText !== text ||
      completionState.cursor !== cursor
    ) {
      await fetchCompletions(text, cursor, (state) => {
        const count = state.receivedCompletions?.length ?? 0;
        applyCompletions({
          ...state,
          index: count > 0 ? (direction > 0 ? 0 : count - 1) : null,
        });
      });
      return;
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

    applyCompletions(completionStateNew);
  };

  const scheduleCompletionFetch = useCallback(
    (text: string, cursor: number) => {
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      completionFetchTimeout.current = window.setTimeout(() => {
        void fetchCompletions(text, cursor);
      }, COMPLETION_DEBOUNCE_MS);
    },
    [completionRequest, fetchCompletions, resetCompletionFetchDebounce],
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

  useLayoutEffect(() => {
    setCompletionState((current) => ({
      ...current,
      receivedCompletions: null,
      index: null,
      replacementRange: null,
    }));
    return () => {
      inputRevision.current++;
      resetCompletionFetchDebounce();
      completionRequest.cancel();
    };
  }, [completionRequest, props.scope, transport, resetCompletionFetchDebounce]);

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
    (inputValue === "" ||
      (completionState.receivedCompletions !== null &&
        completionState.baseText === inputValue &&
        completionState.cursor === cursorPosition));

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

  const acceptCompletion = useCallback(
    (index: number) => {
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      const element = inputRef.current;
      if (!element) {
        return;
      }

      setCompletionState((prev) => {
        if (
          !prev.receivedCompletions ||
          prev.receivedCompletions.length === 0
        ) {
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

        setHistoryPosition({ index: -1, draft: "" });
        setInputValue(newValue);
        pendingCaret.current = newCursor;
        setCursorPosition(newCursor);

        return {
          ...prev,
          baseText: newValue,
          cursor: newCursor,
          index: normalizedIndex,
          replacementRange: newRange,
        };
      });
    },
    [completionRequest, resetCompletionFetchDebounce, setInputValue],
  );

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
      inputValue !== "" &&
      historyPosition.index === -1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey;

    if (e.key === "Enter") {
      e.preventDefault();

      const submittedText = currentTarget.value;
      const currentVal = submittedText.trim();
      setInputValue("");
      const submittedRevision = inputRevision.current;
      setCompletionState({
        baseText: "",
        cursor: 0,
        receivedCompletions: null,
        index: null,
        replacementRange: null,
      });
      pendingCaret.current = 0;
      setCursorPosition(0);
      scheduleCompletionFetch("", 0);

      if (transport === null || currentVal === "") {
        return;
      }

      const nextHistory = appendCommandHistory(commandHistory, currentVal);
      if (nextHistory !== commandHistory) {
        setCommandHistory(nextHistory);
        saveCommandHistory(nextHistory);
      }
      setHistoryPosition({ index: -1, draft: "" });

      const commandService = createClient(CommandService, transport);
      void commandService
        .executeCommand({
          scope: props.scope,
          command: currentVal,
        })
        .catch((error: unknown) => {
          toast.error(ConnectError.from(error).message);
          // A failed request must not replace a newer draft or another view.
          if (
            inputRevision.current !== submittedRevision ||
            inputRef.current !== currentTarget ||
            !currentTarget.isConnected
          )
            return;
          resetCompletionFetchDebounce();
          completionRequest.cancel();
          setInputValue(submittedText);
          pendingCaret.current = submittedText.length;
          setCursorPosition(submittedText.length);
          setCompletionState({
            baseText: submittedText,
            cursor: submittedText.length,
            receivedCompletions: null,
            index: null,
            replacementRange: null,
          });
          if (currentTarget.ownerDocument.activeElement === currentTarget)
            scheduleCompletionFetch(submittedText, submittedText.length);
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

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = navigateCommandHistory(
        commandHistory,
        historyPosition,
        currentTarget.value,
        e.key === "ArrowUp" ? -1 : 1,
      );
      if (!next) return;
      setHistoryPosition(next.position);
      setInputValue(next.value);
      setCompletionState({
        baseText: next.value,
        cursor: next.value.length,
        receivedCompletions: null,
        index: null,
        replacementRange: null,
      });
      pendingCaret.current = next.value.length;
      setCursorPosition(next.value.length);
      scheduleCompletionFetch(next.value, next.value.length);
    }
  };

  const updateCursor = (input: HTMLInputElement) => {
    const position = input.selectionStart ?? input.value.length;
    if (position === cursorPosition) return;
    setCursorPosition(position);
    setCompletionState({
      baseText: input.value,
      cursor: position,
      receivedCompletions: null,
      index: null,
      replacementRange: null,
    });
    scheduleCompletionFetch(input.value, position);
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
          pendingCaret.current = null;
          setHistoryPosition({ index: -1, draft: "" });
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
        onKeyUp={(event) => updateCursor(event.currentTarget)}
        onClick={(event) => updateCursor(event.currentTarget)}
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
          resetCompletionFetchDebounce();
          completionRequest.cancel();
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
