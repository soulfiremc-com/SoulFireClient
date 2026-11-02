import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAnalyticsConsent,
  type AnalyticsConsentStatus,
} from "./analytics-consent";
import {
  getAnalyticsIdentity,
  resetLegacyAnalyticsIdentity,
  syncAnalyticsIdentity,
} from "./analytics-identity";

const root = "00000000-0000-0000-0000-000000000000";
const firstInstallation = "00000000-0000-4000-8000-000000000001";
const secondInstallation = "00000000-0000-4000-8000-000000000002";
const otherUser = "00000000-0000-4000-8000-000000000003";

function client(initialId?: string) {
  let id = initialId;
  const calls: unknown[] = [];
  return {
    calls,
    get_property: () => id,
    reset: (resetDeviceId?: boolean) => {
      calls.push(["reset", resetDeviceId]);
      id = undefined;
    },
    identify: (newId: string, properties?: object) => {
      calls.push(["identify", newId, properties]);
      id = newId;
    },
  };
}

test("analytics identities separate installations and users and survive reloads", () => {
  const first = getAnalyticsIdentity(firstInstallation, root);
  assert.equal(first, `soulfire:${firstInstallation}:${root}`);
  assert.equal(getAnalyticsIdentity(firstInstallation, root), first);
  assert.notEqual(getAnalyticsIdentity(secondInstallation, root), first);
  assert.notEqual(getAnalyticsIdentity(firstInstallation, otherUser), first);
  assert.equal(
    getAnalyticsIdentity(firstInstallation, otherUser.toUpperCase()),
    getAnalyticsIdentity(firstInstallation, otherUser),
  );
});

test("missing, demo, malformed, and zero installation IDs never identify users", () => {
  for (const id of [undefined, "", "DEMO", "not-a-uuid", root]) {
    assert.equal(getAnalyticsIdentity(id, root), null);
  }
  assert.equal(getAnalyticsIdentity(firstInstallation, ""), null);
});

test("SDK initialization resets legacy identities and their contaminated device IDs", () => {
  for (const id of [root, otherUser]) {
    const posthog = client(id);
    resetLegacyAnalyticsIdentity(posthog, () => posthog.reset(true));
    assert.deepEqual(posthog.calls, [["reset", true]]);
  }
  for (const id of [
    undefined,
    getAnalyticsIdentity(firstInstallation, root)!,
  ]) {
    const posthog = client(id);
    resetLegacyAnalyticsIdentity(posthog, () => posthog.reset(true));
    assert.deepEqual(posthog.calls, []);
  }
});

test("migration resets before identifying and does not reset the same user again", () => {
  const posthog = client(root);
  const identity = getAnalyticsIdentity(firstInstallation, root)!;
  const properties = { installation_id: firstInstallation };
  syncAnalyticsIdentity(posthog, identity, properties, () =>
    posthog.reset(true),
  );
  syncAnalyticsIdentity(posthog, identity, properties, () =>
    posthog.reset(true),
  );
  assert.deepEqual(posthog.calls, [
    ["reset", true],
    ["identify", identity, properties],
    ["identify", identity, properties],
  ]);
});

test("switching installations or users resets before the next identity", () => {
  const first = getAnalyticsIdentity(firstInstallation, root)!;
  const second = getAnalyticsIdentity(secondInstallation, root)!;
  const other = getAnalyticsIdentity(secondInstallation, otherUser)!;
  const posthog = client(first);
  syncAnalyticsIdentity(posthog, second, {}, () => posthog.reset(true));
  syncAnalyticsIdentity(posthog, other, {}, () => posthog.reset(true));
  assert.deepEqual(posthog.calls, [
    ["reset", true],
    ["identify", second, {}],
    ["reset", true],
    ["identify", other, {}],
  ]);
});

test("older servers, demo, and impersonation clear identified state without reidentifying", () => {
  const posthog = client(getAnalyticsIdentity(firstInstallation, root)!);
  syncAnalyticsIdentity(posthog, null, {}, () => posthog.reset(true));
  syncAnalyticsIdentity(posthog, null, {}, () => posthog.reset(true));
  assert.deepEqual(posthog.calls, [["reset", true]]);
});

test("legacy identity migration preserves every consent choice while replacing the device ID", () => {
  for (const initialStatus of ["pending", "granted", "denied"] as const) {
    let status: AnalyticsConsentStatus = initialStatus;
    let profileMode: string | undefined;
    const posthog = client(root);
    const consent = createAnalyticsConsent(
      {
        get_explicit_consent_status: () => status,
        set_config: (config) => {
          profileMode = config.person_profiles;
        },
        opt_in_capturing: () => {
          status = "granted";
        },
        opt_out_capturing: () => {
          status = "denied";
        },
        reset: (resetDeviceId) => {
          posthog.reset(resetDeviceId === true);
          status = "pending";
        },
      },
      true,
    );
    resetLegacyAnalyticsIdentity(posthog, () => consent.resetIdentity(true));
    assert.deepEqual(posthog.calls, [["reset", true]]);
    assert.equal(consent.getStatus(), initialStatus);
    assert.equal(
      profileMode,
      initialStatus === "granted" ? "identified_only" : "never",
    );
  }
});
