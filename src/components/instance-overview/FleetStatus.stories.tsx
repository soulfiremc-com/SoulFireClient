import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { expect, within } from "storybook/test";
import {
  BotDesiredState,
  BotListResponseSchema,
  BotRuntimeState,
} from "@/generated/soulfire/bot_pb";
import { InstancePermission } from "@/generated/soulfire/common_pb";
import { botStatusQueryOptions } from "@/lib/bot-status-query.ts";
import type { InstanceInfoQueryData } from "@/lib/types.ts";
import { FleetStatus } from "./fleet-status.tsx";

const entry = (
  id: string,
  runtimeState: BotRuntimeState,
  options: { online?: boolean; error?: string; stopped?: boolean } = {},
) => ({
  profileId: id,
  accountName: id,
  isOnline: options.online ?? false,
  status: {
    profileId: id,
    desiredState: options.stopped
      ? BotDesiredState.STOPPED
      : BotDesiredState.RUNNING,
    runtimeState,
    lastError: options.error,
  },
});

function renderFleet(
  bots: ReturnType<typeof entry>[],
  permissions: InstancePermission[] = [InstancePermission.CONTROL_BOTS],
) {
  const instanceInfo = {
    id: "story",
    profile: { accounts: bots.map((bot) => ({ profileId: bot.profileId })) },
    instancePermissions: permissions.map((instancePermission) => ({
      instancePermission,
      granted: true,
    })),
  } as unknown as InstanceInfoQueryData;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(
    botStatusQueryOptions("story").queryKey,
    create(BotListResponseSchema, { bots }),
  );
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: createRootRoute({
      component: () => <FleetStatus instanceInfo={instanceInfo} />,
    }),
  });
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Bots/Fleet status",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const NeedsAttention: Story = {
  render: () =>
    renderFleet([
      entry("Alder", BotRuntimeState.RUNNING, { online: true }),
      entry("Birch", BotRuntimeState.RETRYING, {
        error: "Connection throttled! Please wait before reconnecting.",
      }),
      entry("Iris", BotRuntimeState.FAILED, { error: "Invalid session" }),
      entry("Kelp", BotRuntimeState.FAILED, {
        error: "Connection refused: a.test:25565",
      }),
      entry("Linden", BotRuntimeState.STOPPED, { stopped: true }),
    ]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Should run is not the same as connected.
    await expect(
      await canvas.findByRole("heading", {
        name: "1 of 4 running bots are connected",
      }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/cannot reach the Minecraft server/),
    ).toBeVisible();
    await expect(canvas.getByText(/account login rejected/)).toBeVisible();
    await expect(canvas.getByText("Open accounts")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: /Restart 1 bot/ }),
    ).toHaveLength(3);
  },
};

export const ViewOnly: Story = {
  render: () =>
    renderFleet(
      [entry("Iris", BotRuntimeState.FAILED, { error: "Invalid session" })],
      [],
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/account login rejected/),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /Restart/ })).toBeNull();
  },
};

export const AllStopped: Story = {
  render: () =>
    renderFleet([
      entry("Alder", BotRuntimeState.STOPPED, { stopped: true }),
      entry("Birch", BotRuntimeState.STOPPED, { stopped: true }),
    ]),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", {
        name: "2 bots are ready. None are running.",
      }),
    ).toBeVisible();
  },
};
