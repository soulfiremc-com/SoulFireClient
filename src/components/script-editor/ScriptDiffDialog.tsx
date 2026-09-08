import { FileDiff } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { useScriptEditorStore } from "@/stores/script-editor-store";

interface DiffResult {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
}

function computeDiff(): DiffResult {
  const state = useScriptEditorStore.getState();
  const { nodes, edges, lastSavedNodes, lastSavedEdges } = state;

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
      if (
        JSON.stringify(saved?.data) !== JSON.stringify(node.data) ||
        JSON.stringify(saved?.position) !== JSON.stringify(node.position)
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
  const { t } = useTranslation("instance");
  const isDirty = useScriptEditorStore((s) => s.isDirty);
  const lastSavedNodes = useScriptEditorStore((s) => s.lastSavedNodes);

  const diff = useMemo(computeDiff, []);

  if (!isDirty || !lastSavedNodes) return null;

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
        <FileDiff className="h-4 w-4" />
        <span className="ml-1 text-xs">{totalChanges}</span>
      </CredenzaTrigger>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle>Unsaved Changes</CredenzaTitle>
          <CredenzaDescription>
            Summary of changes since last save.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody className="space-y-2 text-sm">
          {diff.addedNodes.length > 0 && (
            <div className="text-green-500">
              + {diff.addedNodes.length} node(s) added
            </div>
          )}
          {diff.removedNodes.length > 0 && (
            <div className="text-red-500">
              - {diff.removedNodes.length} node(s) removed
            </div>
          )}
          {diff.modifiedNodes.length > 0 && (
            <div className="text-yellow-500">
              ~ {diff.modifiedNodes.length} node(s) modified
            </div>
          )}
          {diff.addedEdges.length > 0 && (
            <div className="text-green-500">
              + {diff.addedEdges.length} edge(s) added
            </div>
          )}
          {diff.removedEdges.length > 0 && (
            <div className="text-red-500">
              - {diff.removedEdges.length} edge(s) removed
            </div>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
