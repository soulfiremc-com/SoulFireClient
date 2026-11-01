import type { Edge, Node } from "@xyflow/react";
import { edgesToProto, nodesToProto } from "@/lib/script-service";

export type ScriptTemplateId =
  | "greet-on-join"
  | "respawn-on-death"
  | "reply-to-chat"
  | "health-report";

type TemplateNode = {
  id: string;
  type: string;
  x: number;
  y: number;
  data?: Record<string, string | number | boolean>;
};

type TemplateEdge = {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
  kind: "execution" | "data";
};

export type ScriptTemplate = {
  id: ScriptTemplateId;
  nodes: readonly TemplateNode[];
  edges: readonly TemplateEdge[];
};

const exec = (
  from: string,
  fromPort: string,
  to: string,
  toPort = "in",
): TemplateEdge => ({ from, fromPort, to, toPort, kind: "execution" });
const data = (
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): TemplateEdge => ({ from, fromPort, to, toPort, kind: "data" });

/**
 * Starter graphs built only from nodes that the SoulFire server registers.
 * Triggers with a bot pass it on through a data edge. On Interval has no bot,
 * so that template gets its bots from Get Bots and For Each Bot.
 */
export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [
  {
    id: "greet-on-join",
    nodes: [
      { id: "join", type: "trigger.on_join", x: 0, y: 64 },
      {
        id: "wait",
        type: "action.wait",
        x: 320,
        y: 64,
        data: { baseMs: 2000 },
      },
      {
        id: "say",
        type: "action.send_chat",
        x: 640,
        y: 64,
        data: { message: "Hello!" },
      },
    ],
    edges: [
      exec("join", "out", "wait"),
      exec("wait", "out", "say"),
      data("join", "bot", "say", "bot"),
    ],
  },
  {
    id: "respawn-on-death",
    nodes: [
      { id: "death", type: "trigger.on_death", x: 0, y: 64 },
      {
        id: "wait",
        type: "action.wait",
        x: 320,
        y: 64,
        data: { baseMs: 1000 },
      },
      { id: "respawn", type: "action.respawn", x: 640, y: 64 },
    ],
    edges: [
      exec("death", "out", "wait"),
      exec("wait", "out", "respawn"),
      data("death", "bot", "respawn", "bot"),
    ],
  },
  {
    id: "reply-to-chat",
    nodes: [
      { id: "chat", type: "trigger.on_chat", x: 0, y: 64 },
      {
        id: "match",
        type: "string.contains",
        x: 320,
        y: 288,
        data: { search: "!hello", ignoreCase: true },
      },
      { id: "branch", type: "flow.branch", x: 640, y: 64 },
      {
        id: "reply",
        type: "action.send_chat",
        x: 960,
        y: 64,
        data: { message: "Hi there!" },
      },
    ],
    edges: [
      exec("chat", "out", "branch"),
      exec("branch", "exec_true", "reply"),
      data("chat", "messagePlainText", "match", "text"),
      data("match", "result", "branch", "condition"),
      data("chat", "bot", "reply", "bot"),
    ],
  },
  {
    id: "health-report",
    nodes: [
      {
        id: "timer",
        type: "trigger.on_interval",
        x: 0,
        y: 64,
        data: { intervalMs: 60000 },
      },
      { id: "bots", type: "data.get_bots", x: 320, y: 64 },
      { id: "each", type: "flow.foreach_bot", x: 640, y: 64 },
      { id: "health", type: "data.get_health", x: 960, y: 64 },
      {
        id: "log",
        type: "action.print",
        x: 1280,
        y: 64,
        data: { level: "info" },
      },
    ],
    edges: [
      exec("timer", "out", "bots"),
      exec("bots", "out", "each"),
      exec("each", "exec_loop", "health"),
      exec("health", "out", "log"),
      data("bots", "bots", "each", "bots"),
      data("each", "bot", "health", "bot"),
      data("health", "health", "log", "message"),
    ],
  },
];

export type NodeContract = {
  type: string;
  isTrigger?: boolean;
  inputs: readonly { id: string }[];
  outputs: readonly { id: string }[];
};

/** A server may not offer every node, so hide templates it cannot run. */
export function isTemplateSupported(
  template: ScriptTemplate,
  nodeTypes: readonly NodeContract[],
): boolean {
  const byType = new Map(nodeTypes.map((node) => [node.type, node]));
  const nodes = new Map(template.nodes.map((node) => [node.id, node]));
  if (!template.nodes.every((node) => byType.has(node.type))) return false;
  return template.edges.every((edge) => {
    const source = byType.get(nodes.get(edge.from)?.type ?? "");
    const target = byType.get(nodes.get(edge.to)?.type ?? "");
    return (
      source?.outputs.some((port) => port.id === edge.fromPort) &&
      target?.inputs.some((port) => port.id === edge.toPort)
    );
  });
}

/** Builds the editor's graph, with new IDs so it can repeat in one instance. */
export function instantiateScriptTemplate(
  template: ScriptTemplate,
  createId: () => string = () => crypto.randomUUID(),
): { nodes: Node[]; edges: Edge[] } {
  const ids = new Map(template.nodes.map((node) => [node.id, createId()]));
  const newId = (id: string) => ids.get(id) as string;
  return {
    nodes: template.nodes.map((node) => ({
      id: newId(node.id),
      type: node.type,
      position: { x: node.x, y: node.y },
      data: { ...node.data },
    })),
    edges: template.edges.map((edge) => ({
      id: createId(),
      source: newId(edge.from),
      sourceHandle: edge.fromPort,
      target: newId(edge.to),
      targetHandle: edge.toPort,
      type: edge.kind,
      data: { edgeType: edge.kind },
    })),
  };
}

export function scriptTemplateToProto(template: ScriptTemplate) {
  const graph = instantiateScriptTemplate(template);
  return {
    nodes: nodesToProto(graph.nodes),
    edges: edgesToProto(graph.edges),
  };
}
