import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { SdkQuickstart } from "./sdk-quickstart.tsx";

const token = "test-api-token-not-a-secret";
const writeClipboard = fn(async (_text: string) => {});

const meta = {
  title: "Developers/SDK quickstart",
  component: SdkQuickstart,
  args: {
    serverUrl: "http://127.0.0.1:43217",
    instanceId: "11111111-1111-4111-8111-111111111111",
    instanceName: "Development server",
    bots: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Builder",
        online: true,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Miner",
        online: false,
      },
    ],
    integrated: true,
    generateToken: fn(async () => token),
    onOpenAccounts: fn(),
    onOpenBots: fn(),
  },
  beforeEach: () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    writeClipboard.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboard },
    });
    return () => {
      toast.dismiss();
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
  render: (args) => (
    <>
      <SdkQuickstart {...args} />
      <Toaster />
    </>
  ),
} satisfies Meta<typeof SdkQuickstart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LocalServer: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "SDK quickstart" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Local connection", { exact: true }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Python" }));
    await expect(canvas.getByLabelText("example.py")).toHaveTextContent(
      "yield from instance.bots()",
    );
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Terminal platform" }),
    );
    await expect(
      await within(document.body).findByRole("listbox", {
        name: "Terminal platform",
      }),
    ).toBeVisible();
    await userEvent.click(
      await within(document.body).findByRole("option", {
        name: "Windows PowerShell",
      }),
    );
    await expect(
      canvas.getByLabelText("Install dependencies"),
    ).toHaveTextContent("py -3.14 -m venv .venv");
    await expect(
      canvas.getByLabelText("Set the token and run"),
    ).toHaveTextContent("$env:SOULFIRE_TOKEN");
    await userEvent.click(canvas.getByRole("button", { name: "Read state" }));
    await userEvent.click(canvas.getByRole("combobox", { name: "Bot" }));
    await expect(
      await within(document.body).findByRole("listbox", { name: "Bot" }),
    ).toBeVisible();
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "Miner" }),
    );
    await expect(canvas.getByLabelText("example.py")).toHaveTextContent(
      'instance.bot("33333333-3333-4333-8333-333333333333")',
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send chat" }));
    await expect(
      canvas.getByText("This bot is not connected", { exact: true }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("example.py")).toHaveTextContent(
      "yield from bot.chat.send",
    );
  },
};

export const PrivateToken: Story = {
  play: async ({ canvas, userEvent, args }) => {
    await expect(args.generateToken).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate personal token" }),
    );
    const input = canvas.getByLabelText("Personal API token");
    await waitFor(() => expect(input).toHaveValue(token));
    await expect(input).toHaveAttribute("type", "password");
    await expect(canvas.getByLabelText("example.ts")).not.toHaveTextContent(
      token,
    );
    await expect(
      canvas.getByLabelText("Set the token and run"),
    ).not.toHaveTextContent(token);
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy API token" }),
    );
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(token));
    await waitFor(() =>
      expect(
        within(document.body).getByText("Copied to clipboard"),
      ).toBeVisible(),
    );
    await expect(document.body).not.toHaveTextContent(token);
  },
};

export const EmptyInstance: Story = {
  args: { bots: [] },
  play: async ({ canvas, userEvent, args }) => {
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Read state" }));
    await expect(
      canvas.getByText("Add an account to choose a bot"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Open accounts" }),
    );
    await expect(args.onOpenAccounts).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "List bots" }));
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeEnabled();
  },
};

export const RestrictedUser: Story = {
  args: { generateToken: undefined },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Generate personal token" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(/Ask your administrator for a personal API token/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeEnabled();
  },
};

export const Demo: Story = {
  args: { demo: true, serverUrl: null, integrated: false },
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByText("Explore the examples in demo mode"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Generate personal token" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeDisabled();
    await expect(args.generateToken).not.toHaveBeenCalled();
    await expect(canvas.getByLabelText("example.ts")).toHaveTextContent(
      "YOUR_SOULFIRE_SERVER_URL",
    );
    await expect(canvas.getByLabelText("example.ts")).toHaveTextContent(
      "YOUR_INSTANCE_ID",
    );
  },
};

export const TokenFailure: Story = {
  args: {
    generateToken: fn(async () => {
      throw new Error("A private upstream response");
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate personal token" }),
    );
    await expect(
      await canvas.findByText("Could not generate a token"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Generate personal token" }),
    ).toBeEnabled();
    await expect(canvas.getByLabelText("Personal API token")).toHaveValue("");
    await expect(document.body).not.toHaveTextContent(
      "A private upstream response",
    );
  },
};

export const RemoteServer: Story = {
  args: { serverUrl: "https://soulfire.example.test/api", integrated: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Remote connection", { exact: true }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("example.ts")).toHaveTextContent(
      'baseUrl: "https://soulfire.example.test/api"',
    );
  },
};

export const DarkServer: Story = {
  globals: { theme: "dark" },
};
