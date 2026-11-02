import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { Toaster, toast } from "sonner";
import { useState, type ComponentProps } from "react";
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
    await userEvent.click(canvas.getByRole("button", { name: "Run locally" }));
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Terminal platform" }),
    );
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
    await userEvent.click(
      await within(document.body).findByRole("option", { name: /Miner/ }),
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
    const input = await canvas.findByLabelText("Personal API token");
    await waitFor(() => expect(input).toHaveValue(token));
    await expect(input).toHaveAttribute("type", "password");
    await expect(canvas.getByLabelText("example.ts")).not.toHaveTextContent(
      token,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Run locally" }));
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
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy agent prompt" }),
    );
    await waitFor(() => {
      const prompt =
        writeClipboard.mock.calls[writeClipboard.mock.calls.length - 1]?.[0];
      expect(prompt).toContain("SOULFIRE_TOKEN");
      expect(prompt).not.toContain(token);
    });
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
    await userEvent.click(canvas.getByRole("button", { name: "Run locally" }));
    await expect(
      canvas.getByRole("button", { name: "Copy run commands" }),
    ).toBeEnabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy agent prompt" }),
    );
    await waitFor(() =>
      expect(
        writeClipboard.mock.calls[writeClipboard.mock.calls.length - 1]?.[0],
      ).toContain("Ask me for a bot profile ID"),
    );
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
      canvas.queryByRole("button", { name: "Generate personal token" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Ask your administrator for a personal API token/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeEnabled();
  },
};

export const Demo: Story = {
  args: {
    demo: true,
    serverUrl: null,
    integrated: false,
    instanceId: "demo",
    instanceName: "Demo",
  },
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByText(/Demo values are shown in the examples/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Generate personal token" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Copy script" }),
    ).toBeEnabled();
    await expect(args.generateToken).not.toHaveBeenCalled();
    await expect(canvas.getByLabelText("example.ts")).toHaveTextContent(
      "YOUR_SOULFIRE_SERVER_URL",
    );
    await expect(canvas.getByLabelText("example.ts")).toHaveTextContent(
      'client.instance("demo")',
    );
    await userEvent.click(canvas.getByRole("button", { name: "Copy script" }));
    await waitFor(() =>
      expect(writeClipboard).toHaveBeenCalledWith(
        canvas.getByLabelText("example.ts").textContent,
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy agent prompt" }),
    );
    await waitFor(() =>
      expect(
        writeClipboard.mock.calls[writeClipboard.mock.calls.length - 1]?.[0],
      ).toContain("All target values are samples"),
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
    await expect(
      canvas.queryByLabelText("Personal API token"),
    ).not.toBeInTheDocument();
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
  play: async ({ canvas }) => {
    const code = canvas.getByLabelText("example.ts");
    await waitFor(() =>
      expect(code).toHaveAttribute("data-highlighted", "true"),
    );
    const tokens = code.querySelectorAll<HTMLElement>("[data-syntax-token]");
    await expect(tokens.length).toBeGreaterThan(1);
    await expect(
      new Set(Array.from(tokens, (token) => getComputedStyle(token).color))
        .size,
    ).toBeGreaterThan(1);
  },
};

function InstanceSelectionExample(args: ComponentProps<typeof SdkQuickstart>) {
  const [instanceId, setInstanceId] = useState(args.instanceId);
  const instance = args.instances?.find((entry) => entry.id === instanceId);
  return (
    <SdkQuickstart
      {...args}
      instanceId={instanceId}
      instanceName={instance?.name ?? args.instanceName}
      onInstanceChange={(next) => {
        args.onInstanceChange?.(next);
        setInstanceId(next);
      }}
    />
  );
}

export const InstanceSelection: Story = {
  args: {
    instances: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Development server",
      },
      { id: "44444444-4444-4444-8444-444444444444", name: "Test fleet" },
    ],
    onInstanceChange: fn(),
  },
  render: (args) => <InstanceSelectionExample {...args} />,
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate personal token" }),
    );
    await expect(
      await canvas.findByLabelText("Personal API token"),
    ).toHaveValue(token);
    await userEvent.click(canvas.getByRole("button", { name: "Python" }));
    await userEvent.click(canvas.getByRole("combobox", { name: "Instance" }));
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "Test fleet" }),
    );
    await expect(args.onInstanceChange).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
    );
    await expect(canvas.getByLabelText("example.py")).toHaveTextContent(
      'client.instance("44444444-4444-4444-8444-444444444444")',
    );
    await expect(canvas.getByLabelText("Personal API token")).toHaveValue(
      token,
    );
    await expect(args.generateToken).toHaveBeenCalledTimes(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "Copy agent prompt" }),
    );
    await waitFor(() =>
      expect(
        writeClipboard.mock.calls[writeClipboard.mock.calls.length - 1]?.[0],
      ).toContain("44444444-4444-4444-8444-444444444444"),
    );
  },
};

export const Impersonating: Story = {
  args: { impersonating: true },
  play: async ({ canvas, args }) => {
    await expect(
      canvas.queryByRole("button", { name: "Generate personal token" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/Stop impersonating to generate your own API token/),
    ).toBeVisible();
    await expect(args.generateToken).not.toHaveBeenCalled();
  },
};
