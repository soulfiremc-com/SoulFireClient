import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dismissFirstBotSetup,
  getFirstBotSetupState,
  isFirstBotSetupDismissed,
  isFirstBotSetupStarted,
  markFirstBotSetupStarted,
  shouldShowFirstBotSetup,
} from "./first-bot-setup.ts";

const base = {
  address: "127.0.0.1:25565",
  defaultAddress: "127.0.0.1:25565",
  accountCount: 0,
  proxyCount: 0,
  proxiesSkipped: false,
};

test("a new instance starts at the Minecraft server step", () => {
  assert.equal(getFirstBotSetupState(base).nextStep, "server");
});

test("steps advance as the instance gets configured", () => {
  const address = "play.example.test";
  assert.equal(
    getFirstBotSetupState({ ...base, address }).nextStep,
    "accounts",
  );
  assert.equal(
    getFirstBotSetupState({ ...base, address, accountCount: 1 }).nextStep,
    "proxies",
  );
});

test("proxies do not block a first bot", () => {
  const state = getFirstBotSetupState({
    ...base,
    address: "play.example.test",
    accountCount: 1,
    proxiesSkipped: true,
  });
  assert.equal(state.nextStep, "start");
  assert.equal(state.done.proxies, true);
});

test("the guide shows for new instances and leaves once a bot runs", () => {
  const input = {
    accountCount: 0,
    desiredCount: 0,
    onlineCount: 0,
    dismissed: false,
    started: false,
  };
  assert.equal(shouldShowFirstBotSetup(input), true);
  assert.equal(shouldShowFirstBotSetup({ ...input, desiredCount: 1 }), false);
  assert.equal(shouldShowFirstBotSetup({ ...input, onlineCount: 1 }), false);
  assert.equal(shouldShowFirstBotSetup({ ...input, dismissed: true }), false);
});

test("existing instances with stopped bots keep the normal overview", () => {
  const input = {
    accountCount: 12,
    desiredCount: 0,
    onlineCount: 0,
    dismissed: false,
    started: false,
  };
  assert.equal(shouldShowFirstBotSetup(input), false);
  assert.equal(shouldShowFirstBotSetup({ ...input, started: true }), true);
});

function blockedStorage(): never {
  throw new DOMException("Blocked", "SecurityError");
}

test("blocked storage does not break the guide", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: blockedStorage, setItem: blockedStorage },
  });
  try {
    assert.doesNotThrow(() => {
      dismissFirstBotSetup("instance");
      markFirstBotSetupStarted("instance");
    });
    assert.equal(isFirstBotSetupDismissed("instance"), false);
    assert.equal(isFirstBotSetupStarted("instance"), false);
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
