import { createRpcClient } from "@/lib/rpc";
import { Effect } from "effect";
import { ConnectError } from "@connectrpc/connect";
import {
  type KeyboardEventHandler,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TerminalCommandContext } from "@/components/terminal-command-context";
import { TransportContext } from "@/components/providers/transport-context.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type {
  CommandCompletion,
  CommandScope,
} from "@/generated/soulfire/command_pb";
import { CommandService } from "@/generated/soulfire/command_pb";
import { isBotNotReadyError } from "@/lib/bot-availability";
import { getCommandTokenRange } from "@/lib/command-token";
import { getConnectionErrorKind } from "@/lib/connection-errors";
import { isExpectedError } from "@/lib/error-reporting";
import { getCommandSuggestionsPosition } from "@/lib/command-suggestions-position";
import { CommandCompletionRequest } from "@/lib/command-completion-request";
import { cn } from "@/lib/utils";
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
  // Set when the last request failed, so the popup can say why it is empty.
  failed?: boolean;
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
  // Focusing on load opens the on-screen keyboard and hides the log on phones.
  const [autoFocus] = useState(
    () => !window.matchMedia("(pointer: coarse)").matches,
  );
  const composing = useRef(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const suggestionsId = useId();
  const suggestionStatusId = useId();
  const [caretPositionStyle, setCaretPositionStyle] = useState<ReturnType<
    typeof getCommandSuggestionsPosition
  > | null>(null);
  const activeSuggestionRef = useRef<HTMLLIElement | null>(null);
  const setActiveSuggestionNode = useCallback((node: HTMLLIElement | null) => {
    activeSuggestionRef.current = node;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        inputRef.current &&
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1 &&
        /[a-zA-Z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~ ]/u.test(event.key) &&
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
      const isCurrent = () => {
        const input = inputRef.current;
        return (
          !!input &&
          input.ownerDocument.activeElement === input &&
          input.value === text &&
          input.selectionStart === cursor
        );
      };
      try {
        const result = await completionRequest.run(async (signal) => {
          const response = await Effect.runPromise(
            createRpcClient(CommandService, transport).tabCompleteCommand(
              { scope: props.scope, command: text, cursor },
              { signal },
            ),
          );
          return response.suggestions;
        });
        if (!result || result.signal.aborted || !isCurrent()) return;
        accept({
          baseText: text,
          cursor,
          receivedCompletions: result.suggestions,
          index: null,
          replacementRange: getCommandTokenRange(text, cursor),
        });
      } catch (error) {
        // A dropped connection or a bot that is not in a world yet is not a
        // client defect. Show an inline hint instead of reporting it.
        if (!isExpectedError(error) && !isBotNotReadyError(error))
          console.error("Could not load command completions", error);
        if (!isCurrent()) return;
        setCompletionState({
          baseText: text,
          cursor,
          receivedCompletions: [],
          index: null,
          replacementRange: getCommandTokenRange(text, cursor),
          failed: true,
        });
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
          getCommandTokenRange(
            completionStateNew.baseText,
            completionStateNew.cursor,
          );
        const suggestion = suggestionsList[activeIndex]?.suggestion ?? "";

        const before = completionStateNew.baseText.slice(0, range.start);
        const after = completionStateNew.baseText.slice(range.end);
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
            completionStateNew.replacementRange ??
            getCommandTokenRange(text, cursor),
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
        replacementRange: getCommandTokenRange(text, cursor),
      };
    }

    applyCompletions(completionStateNew);
  };

  const scheduleCompletionFetch = useCallback(
    (text: string, cursor: number) => {
      setSuggestionsDismissed(false);
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      // An empty prompt opens suggestions only on Tab. Opening them on focus
      // or after Enter covered the output, and clicking the log refocused the
      // prompt, so the popup could not be dismissed by clicking.
      if (text === "") return;
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
      replacementRangeStart ?? cursorPosition,
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
    setCaretPositionStyle(
      getCommandSuggestionsPosition(
        { left: rawLeft, top: rect.top, bottom: rect.bottom },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [cursorPosition, replacementRangeStart]);
  const repositionFromEvent = useEffectEvent(updateCaretPosition);

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
      return undefined;
    }

    let frame: number | null = null;
    const handleWindowEvent = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        repositionFromEvent();
      });
    };
    const observer = new ResizeObserver(handleWindowEvent);
    if (inputRef.current) observer.observe(inputRef.current);

    window.addEventListener("resize", handleWindowEvent);
    window.addEventListener("scroll", handleWindowEvent, true);

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleWindowEvent);
      window.removeEventListener("scroll", handleWindowEvent, true);
    };
  }, [isFocused]);

  const suggestions = completionState.receivedCompletions ?? [];
  const hasSuggestions = suggestions.length > 0;
  const highlightedIndex = completionState.index ?? 0;
  const showSuggestions =
    isFocused &&
    !suggestionsDismissed &&
    completionState.receivedCompletions !== null &&
    completionState.baseText === inputValue &&
    completionState.cursor === cursorPosition;
  const popupVisible = showSuggestions && caretPositionStyle !== null;
  const listboxVisible = popupVisible && hasSuggestions;

  useEffect(() => {
    if (!popupVisible || !hasSuggestions) {
      activeSuggestionRef.current = null;
      return;
    }

    const node = activeSuggestionRef.current;
    if (node) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [
    popupVisible,
    hasSuggestions,
    highlightedIndex,
    caretPositionStyle?.maxHeight,
    caretPositionStyle?.width,
  ]);

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
          prev.replacementRange ??
          getCommandTokenRange(prev.baseText, prev.cursor);
        const suggestion =
          prev.receivedCompletions[normalizedIndex]?.suggestion;
        if (suggestion === undefined) {
          return prev;
        }
        const before = prev.baseText.slice(0, range.start);
        const after = prev.baseText.slice(range.end);
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

  const terminalCommands = use(TerminalCommandContext);
  const commandErrorMessage = (error: unknown) => {
    if (isBotNotReadyError(error)) return t("commandInput.botNotReady");
    if (getConnectionErrorKind(error) === "connection")
      return t("commandInput.connectionLost");
    return ConnectError.from(error).rawMessage;
  };
  const executeCommand = (value: string) => {
    const nextHistory = appendCommandHistory(commandHistory, value);
    if (nextHistory !== commandHistory) {
      setCommandHistory(nextHistory);
      saveCommandHistory(nextHistory);
    }
    if (!transport) return Promise.resolve();
    return Effect.runPromise(
      createRpcClient(CommandService, transport).executeCommand({
        scope: props.scope,
        command: value,
      }),
    );
  };

  useLayoutEffect(() => {
    if (!terminalCommands) return undefined;
    const handler: NonNullable<typeof terminalCommands.current> = (
      action,
      value,
    ) => {
      if (action === "run_command") {
        if (!transport || !value.trim()) return;
        void executeCommand(value.trim()).catch((error: unknown) =>
          toast.error(commandErrorMessage(error)),
        );
        return;
      }
      inputRef.current?.focus({ preventScroll: true });
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      setInputValue(value);
      pendingCaret.current = value.length;
      setCursorPosition(value.length);
      setHistoryPosition({ index: -1, draft: "" });
      setCompletionState({
        baseText: value,
        cursor: value.length,
        receivedCompletions: null,
        index: null,
        replacementRange: null,
      });
      scheduleCompletionFetch(value, value.length);
    };
    terminalCommands.current = handler;
    return () => {
      if (terminalCommands.current === handler) terminalCommands.current = null;
    };
  });

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (composing.current || e.nativeEvent.isComposing) return;
    const currentTarget = e.currentTarget;
    const caretPosition =
      currentTarget.selectionStart ?? currentTarget.value.length;
    const hasCyclableSuggestions =
      showSuggestions &&
      hasSuggestions &&
      inputValue !== "" &&
      historyPosition.index === -1 &&
      completionState.index !== null &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey;

    if (
      e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.key.toLowerCase() === "c" &&
      currentTarget.selectionStart === currentTarget.selectionEnd
    ) {
      e.preventDefault();
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      setInputValue("");
      pendingCaret.current = 0;
      setCursorPosition(0);
      setHistoryPosition({ index: -1, draft: "" });
      setCompletionState({
        baseText: "",
        cursor: 0,
        receivedCompletions: null,
        index: null,
        replacementRange: null,
      });
      setSuggestionsDismissed(true);
      return;
    }

    if (e.key === "Escape" && !suggestionsDismissed) {
      e.preventDefault();
      e.stopPropagation();
      resetCompletionFetchDebounce();
      completionRequest.cancel();
      setSuggestionsDismissed(true);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const submittedText = currentTarget.value;
      const currentVal = submittedText.trim();
      if (transport === null && currentVal !== "") {
        toast.info(t("commandInput.demoUnavailable"));
        return;
      }
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
      resetCompletionFetchDebounce();
      completionRequest.cancel();

      if (transport === null || currentVal === "") {
        return;
      }

      setHistoryPosition({ index: -1, draft: "" });
      void executeCommand(currentVal).catch((error: unknown) => {
        toast.error(commandErrorMessage(error));
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
      if (suggestionsDismissed) return;
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
    if (composing.current) return;
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
      <InputGroup variant="terminal">
        <InputGroupAddon aria-hidden="true">&gt;</InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          autoFocus={autoFocus}
          // Commands are case sensitive. Phone keyboards must not change them.
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- custom combobox with a filtered popup list, which a native select cannot provide
          role="combobox"
          aria-label={t("commandInput.label")}
          aria-autocomplete="list"
          aria-expanded={listboxVisible}
          aria-controls={listboxVisible ? suggestionsId : undefined}
          aria-activedescendant={
            listboxVisible
              ? `${suggestionsId}-option-${highlightedIndex}`
              : undefined
          }
          aria-describedby={
            popupVisible && !hasSuggestions ? suggestionStatusId : undefined
          }
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
            if (!composing.current) scheduleCompletionFetch(value, cursor);
            setCompletionState({
              baseText: value,
              cursor,
              receivedCompletions: null,
              index: null,
              replacementRange: null,
            });
          }}
          onKeyUp={(event) => {
            updateCursor(event.currentTarget);
          }}
          onClick={(event) => {
            updateCursor(event.currentTarget);
          }}
          onScroll={updateCaretPosition}
          onCompositionStart={() => {
            composing.current = true;
            resetCompletionFetchDebounce();
            completionRequest.cancel();
            setSuggestionsDismissed(true);
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            const input = event.currentTarget;
            scheduleCompletionFetch(
              input.value,
              input.selectionStart ?? input.value.length,
            );
          }}
          onFocus={(event) => {
            const value = event.currentTarget.value;
            const position = event.currentTarget.selectionStart ?? value.length;
            setCursorPosition(position);
            setIsFocused(true);
            setSuggestionsDismissed(false);
            scheduleCompletionFetch(value, position);
          }}
          onBlur={() => {
            resetCompletionFetchDebounce();
            completionRequest.cancel();
            setIsFocused(false);
          }}
        />
      </InputGroup>
      {popupVisible && (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the suggestion popup keeps focus in the input on pointer down
        <div
          className="fixed z-50 max-h-(--suggestions-max-height) w-(--suggestions-width) overflow-auto rounded-md border border-(--terminal-border) bg-(--terminal-popup) text-inherit shadow-md data-[side=top]:-translate-y-full"
          data-side={caretPositionStyle.above ? "top" : "bottom"}
          style={{
            left: caretPositionStyle.left,
            top: caretPositionStyle.top,
            "--suggestions-width": `${caretPositionStyle.width}px`,
            "--suggestions-max-height": `${caretPositionStyle.maxHeight}px`,
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {suggestions.length > 0 ? (
            <ul
              id={suggestionsId}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- the suggestion list follows the ARIA listbox pattern, which datalist cannot render; the suggestion list follows the ARIA listbox pattern
              role="listbox"
              aria-label={t("commandInput.suggestions")}
              className="p-1 font-mono text-xs"
            >
              {suggestions.map((suggestion, index) => {
                const isActive = index === highlightedIndex;
                return (
                  <li
                    key={`${suggestion.suggestion}-${suggestion.tooltip ?? ""}`}
                    id={`${suggestionsId}-option-${index}`}
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- the suggestion list follows the ARIA listbox pattern, which datalist cannot render; the suggestion list follows the ARIA listbox pattern
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-sm px-2 py-1.5 sm:flex-row sm:items-baseline sm:gap-4",
                      isActive
                        ? "bg-(--terminal-active)"
                        : "hover:bg-(--terminal-active)/50",
                    )}
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
                    <div className="shrink-0 font-medium">
                      {suggestion.suggestion}
                    </div>
                    {suggestion.tooltip && (
                      <div className="min-w-0 wrap-break-word text-(--terminal-muted)">
                        {suggestion.tooltip}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <output
              id={suggestionStatusId}
              className="block px-3 py-2 font-mono text-xs text-(--terminal-muted)"
            >
              {completionState.failed
                ? t("commandInput.suggestionsUnavailable")
                : t("commandInput.noSuggestions")}
            </output>
          )}
        </div>
      )}
    </div>
  );
}
