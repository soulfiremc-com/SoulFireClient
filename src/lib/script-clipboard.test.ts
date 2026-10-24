import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleNativePaste,
  hasScriptClipboardData,
  readFromDesktopClipboard,
} from "./script-clipboard";

const graph = {
  nodes: [
    {
      id: "copied",
      type: "constant.number",
      position: { x: 0, y: 0 },
      data: { value: 42 },
    },
  ],
  edges: [],
  sourceScriptId: null,
};

test("clipboard reads validate both supplied text and the stored fallback", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let stored = JSON.stringify(graph);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => stored },
  });
  const paste = (text: string) => {
    let consumed = false;
    const data = handleNativePaste({
      clipboardData: { getData: () => text },
      preventDefault: () => {
        consumed = true;
      },
    } as unknown as ClipboardEvent);
    return { data, consumed };
  };
  try {
    const invalid = {
      ...graph,
      nodes: [{ ...graph.nodes[0], data: { hiddenSockets: 42 } }],
    };
    const encoded = (data: unknown) =>
      `SOULFIRE_SCRIPT_CLIPBOARD:${JSON.stringify(data)}`;
    assert.deepEqual(paste(encoded(graph)), { data: graph, consumed: true });
    for (const text of [
      encoded(invalid),
      encoded({ nodes: 42, edges: [] }),
      "ordinary text",
    ]) {
      assert.deepEqual(paste(text), { data: null, consumed: false });
    }
    assert.deepEqual(paste(""), { data: graph, consumed: true });
    assert.equal(hasScriptClipboardData(), true);
    assert.deepEqual(await readFromDesktopClipboard(), graph);
    stored = JSON.stringify(invalid);
    assert.deepEqual(paste(""), { data: null, consumed: false });
    assert.equal(hasScriptClipboardData(), false);
    assert.equal(await readFromDesktopClipboard(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
