import assert from "node:assert/strict";
import test from "node:test";

import { TRAY_GUID, trayGuidForPlatform } from "./tray-args.ts";

test("Linux tray constructor omits the GUID argument", () => {
  assert.equal(trayGuidForPlatform("linux"), null);
});

test("non-Linux tray constructor includes the stable GUID", () => {
  assert.equal(trayGuidForPlatform("win32"), TRAY_GUID);
});
