import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toaster, toast } from "sonner";
import { expect, fn, waitFor, within } from "storybook/test";
import type { SoulFireDesktopApi } from "@/lib/desktop-api";
import { UpdateReadyPrompt } from "./update-ready-prompt";

const installNow = fn(async () => {});
let readyVersion: string | null = null;
// Each subscription gets its own listener, like Electron IPC listeners.
const listeners = new Set<(version: string) => void>();
const announce = (version: string) => {
  for (const listener of listeners) listener(version);
};

const meta = {
  title: "Desktop/Update ready prompt",
  component: UpdateReadyPrompt,
  beforeEach: () => {
    installNow.mockClear();
    listeners.clear();
    const original = window.soulfireElectron;
    // Only the updates bridge is needed to render the prompt.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the story builds its own fixtures and route tree
    window.soulfireElectron = {
      updates: {
        getReady: async () => readyVersion,
        onReady: async (callback: (version: string) => void) => {
          listeners.add(callback);
          return () => {
            listeners.delete(callback);
          };
        },
        installNow,
      },
    } as unknown as SoulFireDesktopApi;
    return () => {
      toast.dismiss();
      window.soulfireElectron = original;
      readyVersion = null;
    };
  },
  render: () => (
    <>
      <UpdateReadyPrompt />
      <Toaster />
    </>
  ),
} satisfies Meta<typeof UpdateReadyPrompt>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyOnStart: Story = {
  beforeEach: () => {
    readyVersion = "2.11.0";
  },
  play: async ({ userEvent }) => {
    const body = within(document.body);
    // The toast animates in, so wait until it is visible.
    await waitFor(() =>
      expect(
        body.getByText("SoulFire 2.11.0 is ready to install"),
      ).toBeVisible(),
    );
    await expect(body.getByText(/Restarting stops running bots/)).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(installNow).toHaveBeenCalledTimes(1));
  },
};

export const ReadyLaterKeepsBotsRunning: Story = {
  play: async ({ userEvent }) => {
    const body = within(document.body);
    // Announce until the toast shows: an announcement can arrive before the
    // prompt or the toaster subscribes. The fixed toast ID keeps one toast.
    await waitFor(async () => {
      announce("2.11.1");
      await expect(
        body.getByText("SoulFire 2.11.1 is ready to install"),
      ).toBeVisible();
    });
    await userEvent.click(body.getByRole("button", { name: "Later" }));
    await waitFor(() =>
      expect(
        body.queryByText("SoulFire 2.11.1 is ready to install"),
      ).not.toBeInTheDocument(),
    );
    await expect(installNow).not.toHaveBeenCalled();
  },
};
