import type { Meta, StoryObj } from "@storybook/react-vite";
import { PostHog, type CaptureResult } from "posthog-js";
import { useState, useSyncExternalStore } from "react";
import { expect } from "storybook/test";
import { Button } from "@/components/ui/button";
import {
  analyticsConsentConfig,
  createAnalyticsConsent,
} from "@/lib/analytics-consent";
import { CookieConsentBanner } from "./cookie-consent-banner";

const token = "phc_soulfire_consent_test";
const persistenceKey = `ph_${token}_posthog`;
const consentKey = `__ph_opt_in_out_${token}`;
let client: PostHog;
let consent: ReturnType<typeof createAnalyticsConsent>;
let events: CaptureResult[];

function initializeClient() {
  client = new PostHog();
  consent = createAnalyticsConsent(client, true);
  client.init(token, {
    ...analyticsConsentConfig,
    api_host: "https://analytics.invalid",
    defaults: "2026-01-30",
    advanced_disable_flags: true,
    opt_out_useragent_filter: true,
    disable_external_dependency_loading: true,
    disable_session_recording: true,
    disable_surveys: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    cross_subdomain_cookie: false,
    loaded: () => consent.synchronize(),
    before_send: (event) => {
      // Inspect SDK payloads without sending analytics from tests.
      if (event) events.push(event);
      return null;
    },
  });
}

function ConsentExample() {
  const status = useSyncExternalStore(consent.subscribe, consent.getStatus);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Cookie preferences</Button>
      <p>Consent: {status}</p>
      {(status === "pending" || open) && (
        <CookieConsentBanner
          onAccept={() => {
            consent.setConsent(true);
            setOpen(false);
          }}
          onDecline={() => {
            consent.setConsent(false);
            setOpen(false);
          }}
          onClose={status === "pending" ? undefined : () => setOpen(false)}
        />
      )}
    </>
  );
}

const meta = {
  title: "Privacy/Cookie consent",
  component: ConsentExample,
  beforeEach: () => {
    localStorage.removeItem(consentKey);
    localStorage.removeItem(persistenceKey);
    sessionStorage.removeItem(persistenceKey);
    document.cookie = `${persistenceKey}=; path=/; max-age=0`;
    events = [];
    initializeClient();
    return async () => {
      await client.shutdown();
      localStorage.removeItem(consentKey);
      localStorage.removeItem(persistenceKey);
      document.cookie = `${persistenceKey}=; path=/; max-age=0`;
    };
  },
} satisfies Meta<typeof ConsentExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PendingThenDeclined: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("region", { name: "Analytics cookies" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Close" })).toBeNull();
    client.capture("before_choice");
    client.identify("private-user", { email: "private@example.com" });
    await expect(events).toEqual([]);
    await expect(localStorage.getItem(persistenceKey)).toBeNull();
    await expect(document.cookie).not.toContain(persistenceKey);

    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await expect(
      canvas.queryByRole("region", { name: "Analytics cookies" }),
    ).toBeNull();
    await expect(consent.getStatus()).toBe("denied");
    client.capture("after_decline");
    client.identify("private-user", { email: "private@example.com" });
    await expect(events.map((event) => event.event)).toEqual(["after_decline"]);
    await expect(events[0].properties.distinct_id).toBe("$posthog_cookieless");
    await expect(events[0].properties.$process_person_profile).toBe(false);
    await expect(JSON.stringify(events)).not.toContain("private-user");
    await expect(JSON.stringify(events)).not.toContain("private@example.com");
    await expect(localStorage.getItem(persistenceKey)).toBeNull();
    await expect(document.cookie).not.toContain(persistenceKey);

    await client.shutdown();
    initializeClient();
    await expect(consent.getStatus()).toBe("denied");
    client.identify("private-user");
    client.capture("after_reload");
    await expect(events[events.length - 1]?.properties.distinct_id).toBe(
      "$posthog_cookieless",
    );
    await expect(localStorage.getItem(persistenceKey)).toBeNull();
  },
};

export const AcceptAndRemember: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(consent.getStatus()).toBe("granted");
    await expect(
      canvas.queryByRole("region", { name: "Analytics cookies" }),
    ).toBeNull();
    client.identify("consenting-user", { email: "allowed@example.com" });
    client.capture("after_accept");
    await expect(events[events.length - 1]?.properties.distinct_id).toBe(
      "consenting-user",
    );
    await expect(localStorage.getItem(persistenceKey)).not.toBeNull();

    consent.resetIdentity();
    await expect(consent.getStatus()).toBe("granted");
    await expect(client.get_distinct_id()).not.toBe("consenting-user");
    await client.shutdown();
    initializeClient();
    await expect(consent.getStatus()).toBe("granted");
    client.identify("consenting-user");
    await expect(client.get_distinct_id()).toBe("consenting-user");
  },
};

export const WithdrawConsent: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    client.identify("previous-user", { email: "previous@example.com" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Cookie preferences" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(consent.getStatus()).toBe("granted");
    await userEvent.click(
      canvas.getByRole("button", { name: "Cookie preferences" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    events = [];
    client.identify("previous-user", { email: "previous@example.com" });
    client.capture("after_withdrawal");
    await expect(consent.getStatus()).toBe("denied");
    await expect(events.map((event) => event.event)).toEqual([
      "after_withdrawal",
    ]);
    await expect(events[0].properties.distinct_id).toBe("$posthog_cookieless");
    await expect(JSON.stringify(events)).not.toContain("previous-user");
    await expect(JSON.stringify(events)).not.toContain("previous@example.com");
    await expect(localStorage.getItem(persistenceKey)).toBeNull();
    await expect(document.cookie).not.toContain(persistenceKey);
    consent.resetIdentity();
    await expect(consent.getStatus()).toBe("denied");
    await expect(client.get_distinct_id()).toBe("$posthog_cookieless");

    await userEvent.click(
      canvas.getByRole("button", { name: "Cookie preferences" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    events = [];
    client.identify("next-user");
    client.capture("after_accepting_again");
    await expect(consent.getStatus()).toBe("granted");
    await expect(events[events.length - 1]?.properties.distinct_id).toBe(
      "next-user",
    );
    await expect(JSON.stringify(events)).not.toContain("previous-user");
    await expect(localStorage.getItem(persistenceKey)).not.toBeNull();
  },
};
