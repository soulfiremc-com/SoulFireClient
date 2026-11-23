import { useSelector } from "@tanstack/react-store";
import { FileDiff } from "lucide-react";
import { useDeferredValue, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useScriptEditor } from "@/components/script-editor/script-editor-context";
import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaDescription,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
} from "@/components/ui/credenza";
import type { Edge, Node } from "@xyflow/react";

interface DiffResult {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
}

function computeDiff(
  nodes: Node[],
  edges: Edge[],
  lastSavedNodes: Node[] | null,
  lastSavedEdges: Edge[] | null,
): DiffResult {
  const result: DiffResult = {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: [],
  };

  if (!lastSavedNodes || !lastSavedEdges) return result;

  const savedNodeMap = new Map(lastSavedNodes.map((n) => [n.id, n]));
  const currentNodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    if (!savedNodeMap.has(node.id)) {
      result.addedNodes.push(node.id);
    } else {
      const saved = savedNodeMap.get(node.id);
      // Unchanged nodes keep their object, which skips the deep comparison.
      if (
        saved !== node &&
        (JSON.stringify(saved?.data) !== JSON.stringify(node.data) ||
          JSON.stringify(saved?.position) !== JSON.stringify(node.position))
      ) {
        result.modifiedNodes.push(node.id);
      }
    }
  }
  for (const node of lastSavedNodes) {
    if (!currentNodeMap.has(node.id)) {
      result.removedNodes.push(node.id);
    }
  }

  const savedEdgeIds = new Set(lastSavedEdges.map((e) => e.id));
  const currentEdgeIds = new Set(edges.map((e) => e.id));

  for (const edge of edges) {
    if (!savedEdgeIds.has(edge.id)) {
      result.addedEdges.push(edge.id);
    }
  }
  for (const edge of lastSavedEdges) {
    if (!currentEdgeIds.has(edge.id)) {
      result.removedEdges.push(edge.id);
    }
  }

  return result;
}

export function ScriptDiffDialog() {
  const editor = useScriptEditor();
  const { t } = useTranslation("instance");
  const isDirty = useSelector(editor.document, (s) => s.isDirty);
  // The change count can lag behind a drag, so React may skip frames of it.
  const nodes = useDeferredValue(useSelector(editor.document, (s) => s.nodes));
  const edges = useDeferredValue(useSelector(editor.document, (s) => s.edges));
  const lastSavedNodes = useSelector(editor.document, (s) => s.lastSavedNodes);
  const lastSavedEdges = useSelector(editor.document, (s) => s.lastSavedEdges);
  const diff = useMemo(
    () =>
      isDirty
        ? computeDiff(nodes, edges, lastSavedNodes, lastSavedEdges)
        : null,
    [isDirty, nodes, edges, lastSavedNodes, lastSavedEdges],
  );

  if (!diff || !lastSavedNodes) return null;

  const totalChanges =
    diff.addedNodes.length +
    diff.removedNodes.length +
    diff.modifiedNodes.length +
    diff.addedEdges.length +
    diff.removedEdges.length;

  if (totalChanges === 0) return null;

  return (
    <Credenza>
      <CredenzaTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            title={t("scripts.editor.diff.tooltip")}
          />
        }
      >
        <FileDiff className="size-4" />
        <span className="ml-1 text-xs">{totalChanges}</span>
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>{t("scripts.editor.diff.title")}</CredenzaTitle>
          <CredenzaDescription>
            {t("scripts.editor.diff.description")}
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="flex flex-col gap-2 text-sm">
          {diff.addedNodes.length > 0 && (
            <div className="text-success">
              +{" "}
              {t("scripts.editor.diff.nodesAdded", {
                count: diff.addedNodes.length,
              })}
            </div>
          )}
          {diff.removedNodes.length > 0 && (
            <div className="text-destructive">
              -{" "}
              {t("scripts.editor.diff.nodesRemoved", {
                count: diff.removedNodes.length,
              })}
            </div>
          )}
          {diff.modifiedNodes.length > 0 && (
            <div className="text-warning-muted">
              ~{" "}
              {t("scripts.editor.diff.nodesModified", {
                count: diff.modifiedNodes.length,
              })}
            </div>
          )}
          {diff.addedEdges.length > 0 && (
            <div className="text-success">
              +{" "}
              {t("scripts.editor.diff.edgesAdded", {
                count: diff.addedEdges.length,
              })}
            </div>
          )}
          {diff.removedEdges.length > 0 && (
            <div className="text-destructive">
              -{" "}
              {t("scripts.editor.diff.edgesRemoved", {
                count: diff.removedEdges.length,
              })}
            </div>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
