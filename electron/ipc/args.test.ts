import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import {
  DiscordActivityArgs,
  FsWatchArgs,
  NoArgs,
  OpenDialogArgs,
  PathResolveArgs,
  RunIntegratedServerArgs,
  StringArg,
  ThemeArgs,
  WindowArgs,
} from "./args";

function accepts(schema: Schema.ConstraintDecoder<unknown>, args: unknown) {
  return Schema.is(schema)(args);
}

test("optional trailing arguments accept the undefined that preload sends", () => {
  assert.ok(accepts(WindowArgs, []));
  assert.ok(accepts(WindowArgs, [undefined]));
  assert.ok(accepts(WindowArgs, ["pov"]));
  assert.ok(accepts(DiscordActivityArgs, ["Idle", undefined]));
  assert.ok(accepts(DiscordActivityArgs, ["Idle", null]));
  assert.ok(accepts(FsWatchArgs, ["/profile", undefined]));
});

test("unknown window targets and extra arguments are rejected", () => {
  assert.ok(!accepts(WindowArgs, ["main"]));
  assert.ok(!accepts(NoArgs, ["unexpected"]));
  assert.ok(!accepts(StringArg, [42]));
});

test("themes are limited to dark, light, or the system theme", () => {
  assert.ok(accepts(ThemeArgs, [null]));
  assert.ok(accepts(ThemeArgs, ["dark"]));
  assert.ok(!accepts(ThemeArgs, ["blue"]));
  assert.ok(!accepts(ThemeArgs, []));
});

test("file watches need a bounded, non-negative delay", () => {
  assert.ok(accepts(FsWatchArgs, ["/profile", { delayMs: 500 }]));
  assert.ok(!accepts(FsWatchArgs, ["/profile", { delayMs: -1 }]));
  assert.ok(!accepts(FsWatchArgs, ["/profile", { delayMs: Infinity }]));
  assert.ok(!accepts(FsWatchArgs, ["/profile", { recursive: "yes" }]));
});

test("dialog filters must list extensions as strings", () => {
  assert.ok(
    accepts(OpenDialogArgs, [
      { filters: [{ name: "JSON", extensions: ["json"] }], multiple: true },
    ]),
  );
  assert.ok(
    !accepts(OpenDialogArgs, [{ filters: [{ name: "JSON", extensions: 1 }] }]),
  );
  assert.ok(!accepts(OpenDialogArgs, []));
});

test("integrated server runs need string JVM arguments and a named custom jar", () => {
  assert.ok(accepts(RunIntegratedServerArgs, [{ jvmArgs: ["-Xmx2G"] }]));
  assert.ok(
    accepts(RunIntegratedServerArgs, [
      { jvmArgs: [], jarSource: { type: "custom", jarId: "abc" } },
    ]),
  );
  assert.ok(!accepts(RunIntegratedServerArgs, [{ jvmArgs: [1] }]));
  assert.ok(
    !accepts(RunIntegratedServerArgs, [
      { jvmArgs: [], jarSource: { type: "custom", jarId: "" } },
    ]),
  );
});

test("path resolution takes any number of strings", () => {
  assert.ok(accepts(PathResolveArgs, []));
  assert.ok(accepts(PathResolveArgs, ["/a", "b"]));
  assert.ok(!accepts(PathResolveArgs, ["/a", null]));
});
