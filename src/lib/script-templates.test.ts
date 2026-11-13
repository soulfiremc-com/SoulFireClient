import assert from "node:assert/strict";
import { test } from "node:test";
import { EdgeType } from "@/generated/soulfire/script_pb";
import {
  instantiateScriptTemplate,
  isTemplateSupported,
  type NodeContract,
  SCRIPT_TEMPLATES,
  scriptTemplateToProto,
} from "./script-templates.ts";

type PortContract = { id: string; portType: string; required: boolean };
type FullContract = Omit<NodeContract, "inputs" | "outputs"> & {
  isTrigger: boolean;
  inputs: PortContract[];
  outputs: PortContract[];
};

// Ports from the server's NodeRegistry at the commit pinned in buf.gen.yaml.
const SERVER_NODES: FullContract[] = [
  {
    type: "trigger.on_join",
    isTrigger: true,
    inputs: [],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
      {
        id: "serverAddress",
        portType: "STRING",
        required: false,
      },
      {
        id: "username",
        portType: "STRING",
        required: false,
      },
    ],
  },
  {
    type: "trigger.on_chat",
    isTrigger: true,
    inputs: [],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
      {
        id: "message",
        portType: "ANY",
        required: false,
      },
      {
        id: "messagePlainText",
        portType: "STRING",
        required: false,
      },
      {
        id: "timestamp",
        portType: "NUMBER",
        required: false,
      },
    ],
  },
  {
    type: "trigger.on_death",
    isTrigger: true,
    inputs: [],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
      {
        id: "shouldRespawn",
        portType: "BOOLEAN",
        required: false,
      },
    ],
  },
  {
    type: "trigger.on_interval",
    isTrigger: true,
    inputs: [
      {
        id: "intervalMs",
        portType: "NUMBER",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "executionCount",
        portType: "NUMBER",
        required: false,
      },
    ],
  },
  {
    type: "action.wait",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "baseMs",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "jitterMs",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "minMs",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "maxMs",
        portType: "NUMBER",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "actualMs",
        portType: "NUMBER",
        required: false,
      },
    ],
  },
  {
    type: "action.send_chat",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
      {
        id: "message",
        portType: "STRING",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
    ],
  },
  {
    type: "action.respawn",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
    ],
  },
  {
    type: "action.print",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "message",
        portType: "ANY",
        required: true,
      },
      {
        id: "level",
        portType: "STRING",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
    ],
  },
  {
    type: "string.contains",
    isTrigger: false,
    inputs: [
      {
        id: "text",
        portType: "STRING",
        required: false,
      },
      {
        id: "search",
        portType: "STRING",
        required: false,
      },
      {
        id: "ignoreCase",
        portType: "BOOLEAN",
        required: false,
      },
    ],
    outputs: [
      {
        id: "result",
        portType: "BOOLEAN",
        required: false,
      },
    ],
  },
  {
    type: "flow.branch",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "condition",
        portType: "BOOLEAN",
        required: false,
      },
    ],
    outputs: [
      {
        id: "exec_true",
        portType: "EXEC",
        required: false,
      },
      {
        id: "exec_false",
        portType: "EXEC",
        required: false,
      },
      {
        id: "branch",
        portType: "STRING",
        required: false,
      },
      {
        id: "condition",
        portType: "BOOLEAN",
        required: false,
      },
    ],
  },
  {
    type: "data.get_bots",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bots",
        portType: "LIST",
        required: false,
      },
    ],
  },
  {
    type: "flow.foreach_bot",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bots",
        portType: "LIST",
        required: true,
      },
    ],
    outputs: [
      {
        id: "exec_loop",
        portType: "EXEC",
        required: false,
      },
      {
        id: "exec_done",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
      {
        id: "index",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "count",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "isComplete",
        portType: "BOOLEAN",
        required: false,
      },
    ],
  },
  {
    type: "data.get_health",
    isTrigger: false,
    inputs: [
      {
        id: "in",
        portType: "EXEC",
        required: false,
      },
      {
        id: "bot",
        portType: "BOT",
        required: false,
      },
    ],
    outputs: [
      {
        id: "out",
        portType: "EXEC",
        required: false,
      },
      {
        id: "health",
        portType: "NUMBER",
        required: false,
      },
      {
        id: "maxHealth",
        portType: "NUMBER",
        required: false,
      },
    ],
  },
];

const byType = new Map(SERVER_NODES.map((node) => [node.type, node]));

for (const template of SCRIPT_TEMPLATES) {
  test(`${template.id} only uses server nodes and ports`, () => {
    assert.equal(isTemplateSupported(template, SERVER_NODES), true);
  });

  test(`${template.id} connects compatible port kinds`, () => {
    const nodes = new Map(template.nodes.map((node) => [node.id, node]));
    for (const edge of template.edges) {
      const source = byType
        .get(nodes.get(edge.from)?.type ?? "")
        ?.outputs.find((port) => port.id === edge.fromPort);
      const target = byType
        .get(nodes.get(edge.to)?.type ?? "")
        ?.inputs.find((port) => port.id === edge.toPort);
      assert.ok(source && target);
      assert.equal(source.portType === "EXEC", edge.kind === "execution");
      assert.equal(target.portType === "EXEC", edge.kind === "execution");
      if (edge.kind === "data" && target.portType !== "ANY") {
        assert.equal(source.portType, target.portType);
      }
    }
  });

  test(`${template.id} fills every required input`, () => {
    for (const node of template.nodes) {
      for (const port of byType.get(node.type)?.inputs ?? []) {
        if (!port.required) continue;
        const connected = template.edges.some(
          (edge) => edge.to === node.id && edge.toPort === port.id,
        );
        assert.ok(
          connected || port.id in (node.data ?? {}),
          `${node.id}.${port.id}`,
        );
      }
    }
  });

  test(`${template.id} runs every node from one trigger`, () => {
    const triggers = template.nodes.filter(
      (node) => byType.get(node.type)?.isTrigger,
    );
    assert.equal(triggers.length, 1);
    const reached = new Set([triggers[0]?.id]);
    for (let round = 0; round < template.nodes.length; round += 1) {
      for (const edge of template.edges) {
        if (reached.has(edge.from)) reached.add(edge.to);
      }
    }
    assert.equal(reached.size, template.nodes.length);
  });

  test(`${template.id} gives each bot action a bot`, () => {
    for (const node of template.nodes) {
      const needsBot = byType
        .get(node.type)
        ?.inputs.some((port) => port.id === "bot");
      if (!needsBot) continue;
      assert.ok(
        template.edges.some(
          (edge) => edge.to === node.id && edge.toPort === "bot",
        ),
        node.id,
      );
    }
  });
}

test("the interval template gets bots because On Interval has none", () => {
  const template = SCRIPT_TEMPLATES.find((t) => t.id === "health-report");
  const timer = byType.get("trigger.on_interval");
  assert.equal(
    timer?.outputs.some((port) => port.portType === "BOT"),
    false,
  );
  assert.ok(template?.nodes.some((node) => node.type === "flow.foreach_bot"));
});

test("templates are hidden when the server lacks a node", () => {
  const template = SCRIPT_TEMPLATES[0];
  assert.ok(template);
  assert.equal(isTemplateSupported(template, []), false);
  assert.equal(
    isTemplateSupported(
      template,
      SERVER_NODES.filter((node) => node.type !== "action.wait"),
    ),
    false,
  );
});

test("instantiating creates new IDs and keeps the wiring", () => {
  const template = SCRIPT_TEMPLATES[0];
  assert.ok(template);
  let next = 0;
  const graph = instantiateScriptTemplate(template, () => `id-${next++}`);
  assert.equal(new Set(graph.nodes.map((n) => n.id)).size, graph.nodes.length);
  assert.equal(graph.edges[0]?.source, graph.nodes[0]?.id);
  assert.equal(graph.edges[0]?.target, graph.nodes[1]?.id);
});

test("proto output keeps edge kinds and default values", () => {
  const template = SCRIPT_TEMPLATES[0];
  assert.ok(template);
  const proto = scriptTemplateToProto(template);
  assert.equal(proto.edges[0]?.edgeType, EdgeType.EXECUTION);
  assert.equal(proto.edges[2]?.edgeType, EdgeType.DATA);
  assert.equal(proto.nodes[2]?.data.message?.kind.value, "Hello!");
});
