import assert from "node:assert/strict";
import { test } from "node:test";
import { DiscordPresenceManager, type DiscordRpcClient } from "./discord";

function createClient() {
  const activities: Record<string, unknown>[] = [];
  let disconnect: (() => void) | undefined;
  let failLogin = false;
  let logins = 0;
  const client: DiscordRpcClient = {
    login: async () => {
      logins++;
      if (failLogin) throw new Error("Discord is not running");
    },
    on: (_event, handler) => {
      disconnect = handler;
    },
    user: {
      setActivity: async (activity) => {
        activities.push(activity);
      },
    },
  };
  return {
    client,
    activities,
    logins: () => logins,
    disconnect: () => {
      disconnect?.();
    },
    setFailLogin: (value: boolean) => {
      failLogin = value;
    },
  };
}

test("presence logs in once and sends each activity", async () => {
  const discord = createClient();
  const presence = new DiscordPresenceManager(discord.client);
  await presence.update("Dashboard", "Instance");
  await presence.update("Bots");
  assert.equal(discord.logins(), 1);
  assert.deepEqual(
    discord.activities.map((activity) => [
      activity["state"],
      activity["details"],
    ]),
    [
      ["Dashboard", "Instance"],
      ["Bots", undefined],
    ],
  );
});

test("presence reconnects after Discord closes or was not running", async () => {
  const discord = createClient();
  discord.setFailLogin(true);
  const presence = new DiscordPresenceManager(discord.client);
  await presence.update("Dashboard");
  assert.equal(discord.activities.length, 0);

  discord.setFailLogin(false);
  await presence.update("Dashboard");
  assert.equal(discord.logins(), 2);
  assert.equal(discord.activities.length, 1);

  discord.disconnect();
  await presence.update("Bots");
  assert.equal(discord.logins(), 3);
  assert.equal(discord.activities.length, 2);
});
