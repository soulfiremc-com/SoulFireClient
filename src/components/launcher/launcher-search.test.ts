import { expect, test } from "bun:test";
import { parseLauncherSearch } from "./launcher-search";

test("keeps in-app redirects and the launcher flags", () => {
  expect(
    parseLauncherSearch({
      redirect: "/instance/abc/settings?tab=bot",
      configure: "true",
      startLocal: "true",
    }),
  ).toEqual({
    redirect: "/instance/abc/settings?tab=bot",
    configure: "true",
    startLocal: "true",
  });
});

test("drops redirects that could leave the app", () => {
  for (const redirect of [
    "https://example.com",
    "//example.com",
    String.raw`/\example.com`,
    "mailto:user@example.com",
    "user",
    42,
  ]) {
    expect(parseLauncherSearch({ redirect })).toEqual({});
  }
});

test("drops malformed flags without losing valid values", () => {
  expect(
    parseLauncherSearch({
      redirect: "/user",
      configure: "yes",
      startLocal: true,
      other: "value",
    }),
  ).toEqual({ redirect: "/user" });
});
