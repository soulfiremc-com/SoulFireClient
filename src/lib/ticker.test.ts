import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { subscribeToTicker } from "./ticker.ts";

test("subscribers on one interval all tick until they unsubscribe", async () => {
  let first = 0;
  let second = 0;
  const stopFirst = subscribeToTicker(10, () => {
    first++;
  });
  const stopSecond = subscribeToTicker(10, () => {
    second++;
  });
  try {
    await delay(35);
    assert.ok(first > 0);
    assert.ok(second > 0);

    stopFirst();
    const firstAfterStop = first;
    const secondBefore = second;
    await delay(35);
    assert.equal(first, firstAfterStop);
    assert.ok(second > secondBefore);

    stopSecond();
    const secondAfterStop = second;
    await delay(35);
    assert.equal(second, secondAfterStop);
  } finally {
    stopFirst();
    stopSecond();
  }
});

test("the same listener subscribed twice ticks twice and unsubscribes separately", async () => {
  let ticks = 0;
  const listener = () => {
    ticks++;
  };
  const stopA = subscribeToTicker(15, listener);
  const stopB = subscribeToTicker(15, listener);
  try {
    await delay(20);
    assert.equal(ticks % 2, 0);
    assert.ok(ticks >= 2);
    stopA();
    const before = ticks;
    await delay(20);
    assert.ok(ticks > before);
  } finally {
    stopA();
    stopB();
  }
});

test("a timer restarts after every subscriber left", async () => {
  const stop = subscribeToTicker(10, () => {});
  stop();
  let ticks = 0;
  const restart = subscribeToTicker(10, () => {
    ticks++;
  });
  try {
    await delay(35);
    assert.ok(ticks > 0);
  } finally {
    restart();
  }
});
