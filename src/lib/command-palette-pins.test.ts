import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaletteCommand } from "./command-palette";
import {
  PIN_LIMIT,
  palettePinKey,
  prunePalettePins,
  readPalettePins,
  resolvePalettePins,
  togglePalettePin,
} from "./command-palette-pins";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const terminal: PaletteCommand = {
  id: "terminal:farm",
  label: "Terminal",
  projectId: "farm",
  icon: "square-terminal",
  group: "currentProject",
  destination: { to: "/instance/$instance/terminal" },
};
const stopBots: PaletteCommand = {
  id: "stop-bots:farm",
  label: "Stop 2 bots",
  projectId: "farm",
  icon: "square",
  group: "actions",
  operation: {
    kind: "bot",
    instanceId: "farm",
    botIds: ["a", "b"],
    action: "stop",
  },
};
const darkTheme: PaletteCommand = {
  id: "theme-dark",
  label: "Use dark theme",
  icon: "moon",
  group: "actions",
  action: "theme-dark",
};

test("pins persist only IDs and project scope, and survive a reload", () => {
  const storage = memoryStorage();
  const key = palettePinKey("https://server.test", "user-1");
  let pins = togglePalettePin([], stopBots) ?? [];
  pins = togglePalettePin(pins, darkTheme) ?? [];
  storage.setItem(key, JSON.stringify(pins));
  const stored = storage.getItem(key) ?? "";
  assert.doesNotMatch(stored, /botIds|operation|destination/);
  assert.deepEqual(readPalettePins(storage, key), [
    { id: "stop-bots:farm", projectId: "farm" },
    { id: "theme-dark" },
  ]);
  assert.deepEqual(
    readPalettePins(storage, palettePinKey("https://server.test", "user-2")),
    [],
  );
  assert.notEqual(key, palettePinKey("https://other.test", "user-1"));
});

test("stored pins are validated, deduplicated, and bounded", () => {
  for (const value of ["not json", "{}", '"pin"', "null"])
    assert.deepEqual(readPalettePins({ getItem: () => value }, "key"), []);
  const pins = readPalettePins(
    {
      getItem: () =>
        JSON.stringify([
          { id: "a" },
          { id: "a", projectId: "farm" },
          { id: "" },
          { id: 4 },
          { id: "b", projectId: 7 },
          { id: "c", projectId: "farm", botIds: ["x"] },
          { id: "x".repeat(600) },
          ...Array.from({ length: 20 }, (_, index) => ({ id: `n${index}` })),
        ]),
    },
    "key",
  );
  assert.equal(pins.length, PIN_LIMIT);
  assert.deepEqual(pins.slice(0, 3), [
    { id: "a" },
    { id: "c", projectId: "farm" },
    { id: "n0" },
  ]);
});

test("toggling adds, removes, and refuses to exceed the limit", () => {
  const pinned = togglePalettePin([], terminal);
  assert.deepEqual(pinned, [{ id: "terminal:farm", projectId: "farm" }]);
  assert.deepEqual(togglePalettePin(pinned ?? [], terminal), []);
  const full = Array.from({ length: PIN_LIMIT }, (_, index) => ({
    id: `pin-${index}`,
  }));
  assert.equal(togglePalettePin(full, terminal), null);
  assert.equal(togglePalettePin(full, { id: "pin-3" })?.length, PIN_LIMIT - 1);
});

test("pins resolve only to live commands for the same project", () => {
  const pins = [
    { id: "stop-bots:farm", projectId: "farm" },
    { id: "theme-dark" },
    { id: "terminal:farm", projectId: "other" },
    { id: "removed-command" },
  ];
  assert.deepEqual(
    resolvePalettePins([terminal, stopBots, darkTheme], pins).map(
      (command) => command.id,
    ),
    ["stop-bots:farm", "theme-dark"],
  );
  // Without permission the catalog omits the operation, so the pin stays hidden.
  assert.deepEqual(
    resolvePalettePins([terminal, darkTheme], pins).map(
      (command) => command.id,
    ),
    ["theme-dark"],
  );
});

test("pins for deleted or inaccessible projects can be pruned", () => {
  assert.deepEqual(
    prunePalettePins(
      [
        { id: "terminal:farm", projectId: "farm" },
        { id: "terminal:gone", projectId: "gone" },
        { id: "theme-dark" },
      ],
      new Set(["farm"]),
    ),
    [{ id: "terminal:farm", projectId: "farm" }, { id: "theme-dark" }],
  );
});
