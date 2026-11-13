import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ConnectionChoices } from "./connection-choices.tsx";
import { StartupFailureNotice, StartupProgress } from "./startup-status.tsx";

const meta = {
  title: "Launcher/Connection choices",
  component: ConnectionChoices,
  args: {
    demoMode: false,
    canRunLocally: true,
    isDesktop: true,
    savedServer: null,
    onContinueSaved: fn(),
    onEnterDemo: fn(),
    onRunLocally: fn(),
    onConnectExisting: fn(),
  },
} satisfies Meta<typeof ConnectionChoices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // The SoulFire server stays distinct from the Minecraft server.
    await expect(
      canvas.getByText("Minecraft server (you pick it later)"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: /Run on this computer/ }),
    );
    await expect(args.onRunLocally).toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: /Connect to a SoulFire server/ }),
    );
    await expect(args.onConnectExisting).toHaveBeenCalled();
  },
};

export const Web: Story = {
  args: { canRunLocally: false, isDesktop: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /Run on this computer/ }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(/Needs the SoulFire desktop app/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Try the demo/ }),
    ).toBeVisible();
  },
};

export const DemoMode: Story = {
  args: { demoMode: true, canRunLocally: false, isDesktop: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /Connect to a SoulFire server/ }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: /Try the demo/ }));
    await expect(args.onEnterDemo).toHaveBeenCalled();
  },
};

export const SavedServer: Story = {
  args: { savedServer: { address: "https://sf.example.test" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "Continue with https://sf.example.test",
      }),
    );
    await expect(args.onContinueSaved).toHaveBeenCalled();
  },
};

export const StartingUp: Story = {
  render: () => <StartupProgress stage="start" />,
  play: async ({ canvasElement }) => {
    const current = canvasElement.querySelector('[aria-current="step"]');
    await expect(current).toHaveTextContent("Start the server");
  },
};

export const PortInUse: Story = {
  render: () => <StartupFailureNotice failure="port-in-use" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent(
      "Another program is using the server port",
    );
  },
};

export const UnknownFailure: Story = {
  render: () => <StartupFailureNotice failure="unknown" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent(
      "The server stopped before it was ready",
    );
  },
};
