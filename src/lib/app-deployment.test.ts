import assert from "node:assert/strict";
import { test } from "node:test";
import { getAppUrl, isDemoHostname } from "./app-deployment.ts";

test("both demo deployments enable demo mode", () => {
  assert.equal(isDemoHostname("demo.soulfiremc.com"), true);
  assert.equal(isDemoHostname("preview-demo.soulfiremc.com"), true);
});

test("app deployments and unrelated hosts do not enable demo mode", () => {
  for (const hostname of [
    "app.soulfiremc.com",
    "preview.soulfiremc.com",
    "localhost",
    "feature.soulfire-client.pages.dev",
    "preview-demo.soulfiremc.com.example.com",
    "other-demo.soulfiremc.com",
  ]) {
    assert.equal(isDemoHostname(hostname), false, hostname);
  }
});

test("demo links stay in the current release channel", () => {
  assert.equal(getAppUrl("production", true), "https://demo.soulfiremc.com");
  assert.equal(
    getAppUrl("preview", true),
    "https://preview-demo.soulfiremc.com",
  );
  assert.equal(getAppUrl("development", true), "https://demo.soulfiremc.com");
});

test("release channel links preserve app and demo modes", () => {
  assert.equal(getAppUrl("production"), "https://app.soulfiremc.com");
  assert.equal(getAppUrl("preview"), "https://preview.soulfiremc.com");
  assert.equal(getAppUrl("development"), "https://app.soulfiremc.com");
  for (const environment of ["production", "preview"] as const) {
    assert.equal(
      isDemoHostname(new URL(getAppUrl(environment)).hostname),
      false,
    );
    assert.equal(
      isDemoHostname(new URL(getAppUrl(environment, true)).hostname),
      true,
    );
  }
});
