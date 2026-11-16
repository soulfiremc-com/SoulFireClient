import assert from "node:assert/strict";
import { test } from "node:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { isBotNotReadyError } from "./bot-availability";

test("offline bots and bots without a world are not ready", () => {
  for (const error of [
    new ConnectError("Bot 'a' is not online", Code.FailedPrecondition),
    new ConnectError("Bot player is not available", Code.FailedPrecondition),
    new ConnectError(
      'Cannot invoke "net.minecraft.client.multiplayer.ClientLevel.entitiesForRendering()" because "com.soulfiremc.server.bot.BotConnection.minecraft().level" is null',
      Code.Internal,
    ),
    new ConnectError(
      'java.lang.NullPointerException: Cannot invoke "net.minecraft.client.multiplayer.ClientLevel.registryAccess()" because "level" is null',
      Code.Internal,
    ),
    new ConnectError(
      'Cannot invoke "net.minecraft.client.player.LocalPlayer.position()" because "com.soulfiremc.server.bot.BotConnection.minecraft().player" is null',
      Code.Internal,
    ),
  ]) {
    assert.equal(isBotNotReadyError(error), true, error.message);
  }
});

test("other failures still surface", () => {
  for (const error of [
    new ConnectError("Database closed", Code.Internal),
    new ConnectError('because "config" is null', Code.Internal),
    new ConnectError("Server stopped", Code.Unavailable),
    new Error("Bot 'a' is not online"),
  ]) {
    assert.equal(isBotNotReadyError(error), false, String(error));
  }
});
