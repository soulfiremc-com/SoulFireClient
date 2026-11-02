import type { TerminalLogContent } from "@/lib/terminal-interactions";

// Types for the script editor node-based system

export type PortType = "number" | "string" | "boolean" | "any" | "trigger";

export interface Port {
  id: string;
  name: string;
  type: PortType;
}

export interface NodeDefinition {
  type: string;
  name: string;
  description: string;
  category: NodeCategory;
  icon: string;
  inputs: Port[];
  outputs: Port[];
  defaultData?: Record<string, unknown>;
}

export type NodeCategory =
  | "triggers"
  | "math"
  | "logic"
  | "actions"
  | "data"
  | "flow-control";

export interface ScriptNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ScriptConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface Script {
  id: string;
  name: string;
  nodes: ScriptNode[];
  connections: ScriptConnection[];
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry extends TerminalLogContent {
  id: string;
  timestamp: Date;
  level: LogLevel;
  nodeId: string | null;
}

// Node definitions registry
export const NODE_DEFINITIONS: NodeDefinition[] = [
  // Triggers
  {
    type: "on-start",
    name: "On Start",
    description: "Triggers when the script starts executing",
    category: "triggers",
    icon: "Play",
    inputs: [],
    outputs: [{ id: "trigger", name: "Trigger", type: "trigger" }],
  },
  {
    type: "on-interval",
    name: "On Interval",
    description: "Triggers at a specified time interval",
    category: "triggers",
    icon: "Timer",
    inputs: [],
    outputs: [{ id: "trigger", name: "Trigger", type: "trigger" }],
    defaultData: { interval: 1000 },
  },
  {
    type: "on-event",
    name: "On Event",
    description: "Triggers when a specific game event occurs",
    category: "triggers",
    icon: "Zap",
    inputs: [],
    outputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "data", name: "Event Data", type: "any" },
    ],
    defaultData: { eventType: "player-join" },
  },

  // Math
  {
    type: "add",
    name: "Add",
    description: "Adds two numbers together",
    category: "math",
    icon: "Plus",
    inputs: [
      { id: "a", name: "A", type: "number" },
      { id: "b", name: "B", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
  },
  {
    type: "subtract",
    name: "Subtract",
    description: "Subtracts B from A",
    category: "math",
    icon: "Minus",
    inputs: [
      { id: "a", name: "A", type: "number" },
      { id: "b", name: "B", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
  },
  {
    type: "multiply",
    name: "Multiply",
    description: "Multiplies two numbers",
    category: "math",
    icon: "X",
    inputs: [
      { id: "a", name: "A", type: "number" },
      { id: "b", name: "B", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
  },
  {
    type: "divide",
    name: "Divide",
    description: "Divides A by B",
    category: "math",
    icon: "Divide",
    inputs: [
      { id: "a", name: "A", type: "number" },
      { id: "b", name: "B", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
  },
  {
    type: "random",
    name: "Random",
    description: "Generates a random number between min and max",
    category: "math",
    icon: "Shuffle",
    inputs: [
      { id: "min", name: "Min", type: "number" },
      { id: "max", name: "Max", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
    defaultData: { min: 0, max: 100 },
  },
  {
    type: "formula",
    name: "Formula",
    description: "Evaluates a mathematical formula",
    category: "math",
    icon: "Calculator",
    inputs: [
      { id: "x", name: "X", type: "number" },
      { id: "y", name: "Y", type: "number" },
    ],
    outputs: [{ id: "result", name: "Result", type: "number" }],
    defaultData: { formula: "x + y" },
  },

  // Logic
  {
    type: "compare",
    name: "Compare",
    description: "Compares two values",
    category: "logic",
    icon: "Scale",
    inputs: [
      { id: "a", name: "A", type: "any" },
      { id: "b", name: "B", type: "any" },
    ],
    outputs: [{ id: "result", name: "Result", type: "boolean" }],
    defaultData: { operator: "==" },
  },
  {
    type: "and",
    name: "AND",
    description: "Returns true if both inputs are true",
    category: "logic",
    icon: "Circle",
    inputs: [
      { id: "a", name: "A", type: "boolean" },
      { id: "b", name: "B", type: "boolean" },
    ],
    outputs: [{ id: "result", name: "Result", type: "boolean" }],
  },
  {
    type: "or",
    name: "OR",
    description: "Returns true if either input is true",
    category: "logic",
    icon: "Circle",
    inputs: [
      { id: "a", name: "A", type: "boolean" },
      { id: "b", name: "B", type: "boolean" },
    ],
    outputs: [{ id: "result", name: "Result", type: "boolean" }],
  },
  {
    type: "not",
    name: "NOT",
    description: "Inverts a boolean value",
    category: "logic",
    icon: "Ban",
    inputs: [{ id: "value", name: "Value", type: "boolean" }],
    outputs: [{ id: "result", name: "Result", type: "boolean" }],
  },

  // Actions
  {
    type: "log",
    name: "Log",
    description: "Logs a message to the console",
    category: "actions",
    icon: "MessageSquare",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "message", name: "Message", type: "string" },
    ],
    outputs: [{ id: "trigger", name: "Done", type: "trigger" }],
    defaultData: { level: "info" },
  },
  {
    type: "send-chat",
    name: "Send Chat",
    description: "Sends a chat message",
    category: "actions",
    icon: "Send",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "message", name: "Message", type: "string" },
    ],
    outputs: [{ id: "trigger", name: "Done", type: "trigger" }],
  },
  {
    type: "move-to",
    name: "Move To",
    description: "Moves the bot to a position",
    category: "actions",
    icon: "Navigation",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "x", name: "X", type: "number" },
      { id: "y", name: "Y", type: "number" },
      { id: "z", name: "Z", type: "number" },
    ],
    outputs: [
      { id: "trigger", name: "Done", type: "trigger" },
      { id: "success", name: "Success", type: "boolean" },
    ],
  },
  {
    type: "wait",
    name: "Wait",
    description: "Waits for a specified duration",
    category: "actions",
    icon: "Clock",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "duration", name: "Duration (ms)", type: "number" },
    ],
    outputs: [{ id: "trigger", name: "Done", type: "trigger" }],
    defaultData: { duration: 1000 },
  },

  // Data
  {
    type: "number",
    name: "Number",
    description: "A constant number value",
    category: "data",
    icon: "Hash",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "number" }],
    defaultData: { value: 0 },
  },
  {
    type: "string",
    name: "String",
    description: "A constant string value",
    category: "data",
    icon: "Type",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "string" }],
    defaultData: { value: "" },
  },
  {
    type: "boolean",
    name: "Boolean",
    description: "A constant boolean value",
    category: "data",
    icon: "ToggleLeft",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "boolean" }],
    defaultData: { value: false },
  },
  {
    type: "get-variable",
    name: "Get Variable",
    description: "Gets a variable value",
    category: "data",
    icon: "Variable",
    inputs: [],
    outputs: [{ id: "value", name: "Value", type: "any" }],
    defaultData: { variableName: "" },
  },
  {
    type: "set-variable",
    name: "Set Variable",
    description: "Sets a variable value",
    category: "data",
    icon: "Variable",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "value", name: "Value", type: "any" },
    ],
    outputs: [{ id: "trigger", name: "Done", type: "trigger" }],
    defaultData: { variableName: "" },
  },

  // Flow Control
  {
    type: "branch",
    name: "Branch",
    description: "Branches execution based on a condition",
    category: "flow-control",
    icon: "GitBranch",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "condition", name: "Condition", type: "boolean" },
    ],
    outputs: [
      { id: "true", name: "True", type: "trigger" },
      { id: "false", name: "False", type: "trigger" },
    ],
  },
  {
    type: "loop",
    name: "Loop",
    description: "Repeats execution a number of times",
    category: "flow-control",
    icon: "Repeat",
    inputs: [
      { id: "trigger", name: "Trigger", type: "trigger" },
      { id: "count", name: "Count", type: "number" },
    ],
    outputs: [
      { id: "loop", name: "Loop", type: "trigger" },
      { id: "index", name: "Index", type: "number" },
      { id: "done", name: "Done", type: "trigger" },
    ],
    defaultData: { count: 10 },
  },
  {
    type: "sequence",
    name: "Sequence",
    description: "Executes multiple outputs in sequence",
    category: "flow-control",
    icon: "List",
    inputs: [{ id: "trigger", name: "Trigger", type: "trigger" }],
    outputs: [
      { id: "out1", name: "1", type: "trigger" },
      { id: "out2", name: "2", type: "trigger" },
      { id: "out3", name: "3", type: "trigger" },
    ],
  },
];

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((def) => def.type === type);
}

export function getNodesByCategory(category: NodeCategory): NodeDefinition[] {
  return NODE_DEFINITIONS.filter((def) => def.category === category);
}

export const CATEGORY_INFO: Record<
  NodeCategory,
  { name: string; icon: string; description: string }
> = {
  triggers: {
    name: "Triggers",
    icon: "Zap",
    description: "Events that start script execution",
  },
  math: {
    name: "Math",
    icon: "Calculator",
    description: "Mathematical operations",
  },
  logic: {
    name: "Logic",
    icon: "GitBranch",
    description: "Boolean logic operations",
  },
  actions: {
    name: "Actions",
    icon: "Play",
    description: "Actions the bot can perform",
  },
  data: {
    name: "Data",
    icon: "Database",
    description: "Data values and variables",
  },
  "flow-control": {
    name: "Flow Control",
    icon: "Workflow",
    description: "Control script execution flow",
  },
};
