import { useSelector } from "@tanstack/react-store";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getNodeDefinition } from "@/components/script-editor/nodes/types";
import { useScriptEditor } from "@/components/script-editor/ScriptEditorProvider";

/**
 * Computes and displays a complexity score for the current script.
 * Score: nodeCount * 1 + edgeCount * 0.5 + loopNodes * 3 + maxFanOut * 2
 */
export function ComplexityScore() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const { nodes, edges } = useSelector(editor.validationGraph);

  const { score, color } = useMemo(() => {
    let loopNodes = 0;
    let maxFanOut = 0;

    const fanOutCount: Record<string, number> = {};
    for (const edge of edges) {
      fanOutCount[edge.source] = (fanOutCount[edge.source] ?? 0) + 1;
    }
    for (const count of Object.values(fanOutCount)) {
      if (count > maxFanOut) maxFanOut = count;
    }

    for (const node of nodes) {
      if (!node.type) continue;
      const def = getNodeDefinition(node.type);
      if (!def) continue;
      const hasLoopPort = def.outputs.some((p) => p.id === "exec_loop");
      if (hasLoopPort) loopNodes++;
    }

    const s =
      nodes.length * 1 + edges.length * 0.5 + loopNodes * 3 + maxFanOut * 2;
    const c =
      s < 50
        ? "text-success"
        : s < 100
          ? "text-warning-muted"
          : "text-destructive";
    return { score: Math.round(s), color: c };
  }, [nodes, edges]);

  if (nodes.length === 0) return null;

  return (
    <span
      className={`text-xs font-mono ${color}`}
      title={t("scripts.editor.complexity.title")}
    >
      {score}
    </span>
  );
}
