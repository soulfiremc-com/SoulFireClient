import { beforeAll, expect, test } from "bun:test";
import { init } from "i18next";
import cast from "../../locales/en-US/cast.json";
import { castErrorMessage } from "./cast-client";

beforeAll(async () => {
  await init({
    lng: "en-US",
    resources: { "en-US": { cast } },
  });
});

test("Cast error codes from the desktop process are translated", () => {
  expect(castErrorMessage("receiverNoResponse")).toBe(
    "The Cast receiver did not respond.",
  );
  expect(
    castErrorMessage(
      "Error invoking remote method 'cast:connect': CastError: launchTimeout",
    ),
  ).toBe("The Cast receiver took too long to start.");
  // The store keeps this code for unreadable state and translates on render.
  expect(castErrorMessage("invalidState")).toBe(
    "The desktop app sent Cast data that this page cannot read. Restart SoulFire.",
  );
});

test("other Cast errors are shown as they are", () => {
  expect(castErrorMessage("connect ECONNREFUSED 192.0.2.1:8009")).toBe(
    "connect ECONNREFUSED 192.0.2.1:8009",
  );
  expect(castErrorMessage("timeout")).toBe("timeout");
});
