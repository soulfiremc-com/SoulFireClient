import { type NodeProps, useReactFlow } from "@xyflow/react";
import { memo, useCallback, useMemo } from "react";
import { useNodeEditing } from "../node-editing-context";
import { BaseNode, type BaseNodeData } from "./BaseNode";
import {
  getPortDefinition,
  hasTypeVariables,
  type NodeDefinition,
  resolveNodeTypeVars,
  simpleType,
  type TypeDescriptor,
} from "./types";

// Check if a node definition has any ports with type variables
function definitionHasTypeVars(def: NodeDefinition): boolean {
  return (
    def.inputs.some(
      (p) => p.typeDescriptor && hasTypeVariables(p.typeDescriptor),
    ) ||
    def.outputs.some(
      (p) => p.typeDescriptor && hasTypeVariables(p.typeDescriptor),
    )
  );
}

// Factory function to create node components from definitions
// Uses NodeEditingContext for inline editing capabilities
export function createNodeComponent(definition: NodeDefinition) {
  const hasGenericPorts = definitionHasTypeVars(definition);

  const NodeComponent = (props: NodeProps) => {
    const { edges, updateNodeData } = useNodeEditing();
    const { getNodes } = useReactFlow();

    const handleDataChange = useCallback(
      (data: Record<string, unknown>) => {
        updateNodeData(props.id, data);
      },
      [props.id, updateNodeData],
    );

    const nodeData = props.data as BaseNodeData;

    // Compute type variable bindings for generic nodes
    const typeBindings = useMemo(() => {
      if (!hasGenericPorts) return undefined;

      const connectedInputTypes = new Map<string, TypeDescriptor>();
      const allNodes = getNodes();

      for (const edge of edges) {
        if (
          edge.target !== props.id ||
          !edge.targetHandle ||
          !edge.sourceHandle
        )
          continue;

        // Find the source node to get its type
        const sourceNode = allNodes.find((n) => n.id === edge.source);
        if (!sourceNode?.type) continue;

        // Look up the source port's type descriptor
        const srcPortDef = getPortDefinition(
          sourceNode.type,
          edge.sourceHandle,
        );
        if (srcPortDef?.typeDescriptor) {
          connectedInputTypes.set(edge.targetHandle, srcPortDef.typeDescriptor);
        } else if (srcPortDef) {
          connectedInputTypes.set(
            edge.targetHandle,
            simpleType(srcPortDef.type),
          );
        }
      }

      if (connectedInputTypes.size === 0) return undefined;

      const bindings = resolveNodeTypeVars(
        definition.type,
        connectedInputTypes,
      );
      return bindings.size > 0 ? bindings : undefined;
    }, [edges, props.id, getNodes]);

    return (
      <BaseNode
        {...props}
        definition={definition}
        data={nodeData}
        edges={edges}
        onDataChange={handleDataChange}
        typeBindings={typeBindings}
      />
    );
  };
  NodeComponent.displayName = `${definition.type}Node`;
  return memo(NodeComponent);
}
