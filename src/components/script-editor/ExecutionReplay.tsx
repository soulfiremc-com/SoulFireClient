import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";
import { Button } from "@/components/ui/button";

interface RecordedEvent {
  timestamp: number;
  type: "node_started" | "node_completed" | "node_error" | "log";
  nodeId: string | null;
  message?: string;
}

interface ExecutionReplayProps {
  events: RecordedEvent[];
  onStepChange?: (stepIndex: number) => void;
  onClose?: () => void;
}

/**
 * Timeline bar for replaying recorded execution events.
 * Highlights the active node at each step and allows stepping through execution.
 */
export function ExecutionReplay({
  events,
  onStepChange,
  onClose,
}: ExecutionReplayProps) {
  const editor = useScriptEditor();
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const setActiveNode = editor.actions.setActiveNode;

  const nodeEvents = useMemo(
    () => events.filter((e) => e.nodeId != null),
    [events],
  );

  const currentEvent = nodeEvents[stepIndex];
  const totalSteps = nodeEvents.length;

  const goToStep = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalSteps - 1));
      setStepIndex(clamped);
      const event = nodeEvents[clamped];
      if (event?.nodeId) {
        setActiveNode(event.nodeId);
      }
      onStepChange?.(clamped);
    },
    [totalSteps, nodeEvents, setActiveNode, onStepChange],
  );

  const handlePrev = useCallback(
    () => goToStep(stepIndex - 1),
    [goToStep, stepIndex],
  );
  const handleNext = useCallback(
    () => goToStep(stepIndex + 1),
    [goToStep, stepIndex],
  );

  if (totalSteps === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-t border-border">
      <span className="text-xs font-medium text-muted-foreground">Replay</span>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handlePrev}
        disabled={stepIndex === 0}
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>

      <span className="text-xs font-mono min-w-[60px] text-center">
        {stepIndex + 1} / {totalSteps}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleNext}
        disabled={stepIndex >= totalSteps - 1}
      >
        <ChevronRight className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3" />
        )}
      </Button>

      {currentEvent && (
        <span className="text-xs text-muted-foreground truncate">
          {currentEvent.type}: {currentEvent.nodeId}
          {currentEvent.message && ` - ${currentEvent.message}`}
        </span>
      )}

      <div className="flex-1" />

      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
