import type { EdgeTypes } from "@xyflow/react";

import { DataEdge } from "./DataEdge";
import { ExecutionEdge } from "./ExecutionEdge";

/**
 * Edge types map for React Flow registration
 */
export const edgeTypes: EdgeTypes = {
  execution: ExecutionEdge,
  data: DataEdge,
};
