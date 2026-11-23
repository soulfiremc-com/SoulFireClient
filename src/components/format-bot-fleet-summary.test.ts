import assert from "node:assert/strict";
import { test } from "node:test";
import { create } from "@bufbuild/protobuf";
import type { TFunction } from "i18next";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb";
import { formatBotFleetSummary } from "./format-bot-fleet-summary.ts";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test only needs the key and options the formatter passes
const t = ((key: string, options?: object) =>
  options
    ? `${key} ${JSON.stringify(options)}`
    : key) as unknown as TFunction<"common">;

test("a project without bots says so instead of listing zero counts", () => {
  assert.equal(formatBotFleetSummary(t, undefined), "botFleetSummaryEmpty");
  assert.equal(
    formatBotFleetSummary(t, create(BotFleetSummarySchema, {})),
    "botFleetSummaryEmpty",
  );
});

test("a project with bots lists its counts", () => {
  assert.equal(
    formatBotFleetSummary(
      t,
      create(BotFleetSummarySchema, {
        totalBots: 3,
        desiredBots: 2,
        onlineBots: 1,
      }),
    ),
    'botFleetSummary {"online":1,"desired":2,"total":3}',
  );
});
