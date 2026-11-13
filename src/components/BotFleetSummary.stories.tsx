import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BotFleetSummaryBadge } from "./bot-fleet-summary";
import { BotFleetSummarySchema } from "@/generated/soulfire/bot_pb";

const meta = {
  title: "Bots/Fleet summary",
  component: BotFleetSummaryBadge,
  args: {
    summary: create(BotFleetSummarySchema, {
      totalBots: 20,
      desiredBots: 20,
      onlineBots: 20,
    }),
  },
} satisfies Meta<typeof BotFleetSummaryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};

export const Starting: Story = {
  args: {
    summary: create(BotFleetSummarySchema, {
      totalBots: 20,
      desiredBots: 20,
      onlineBots: 12,
      startingBots: 8,
    }),
  },
};

export const Retrying: Story = {
  args: {
    summary: create(BotFleetSummarySchema, {
      totalBots: 20,
      desiredBots: 20,
      onlineBots: 16,
      retryingBots: 4,
    }),
  },
};

export const Failed: Story = {
  args: {
    summary: create(BotFleetSummarySchema, {
      totalBots: 20,
      desiredBots: 20,
      onlineBots: 15,
      retryingBots: 2,
      failedBots: 3,
    }),
  },
};

export const Stopped: Story = {
  args: { summary: create(BotFleetSummarySchema, { totalBots: 20 }) },
};

export const Empty: Story = {
  args: { summary: create(BotFleetSummarySchema) },
};

export const WithoutSummary: Story = {
  args: { summary: undefined },
};
