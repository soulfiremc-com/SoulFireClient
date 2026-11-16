import type { EdgeTypes } from "@xyflow/react";

import { DataEdge, type DataEdgeType } from "./DataEdge";
import { ExecutionEdge, type ExecutionEdgeType } from "./ExecutionEdge";

/**
 * Edge types map for React Flow registration
 */
const edgeTypes: EdgeTypes = {
  execution: ExecutionEdge,
  data: DataEdge,
};

export * from "./connection-validation";
export { ConnectionLine } from "./ConnectionLine";
export {
  DataEdge,
  type DataEdgeType,
  ExecutionEdge,
  type ExecutionEdgeType,
  edgeTypes,
};
