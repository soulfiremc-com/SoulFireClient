import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, mocked, waitFor } from "storybook/test";

type UserEvent = ReturnType<typeof import("storybook/test").userEvent.setup>;
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import ProxyProvidersDialog from "./proxy-providers-dialog.tsx";
import { settledDialog } from "./provider-story-helpers.ts";

const requests: { url: string; body?: string }[] = [];
const meta = {
  title: "Providers/Proxy connections",
  component: ProxyProvidersDialog,
  args: {
    open: true,
    canImport: true,
    onOpenChange: fn(),
    onImport: fn().mockResolvedValue(undefined),
  },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    requests.length = 0;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url.startsWith("https://proxy.webshare.io/")) {
        requests.push({ url });
        return Response.json({
          next: null,
          results: [
            {
              proxy_address: "192.0.2.1",
              port: 1080,
              username: "test-user",
              password: "test-password",
              valid: true,
            },
          ],
        });
      }
      if (url.startsWith("https://proxy-seller.com/")) {
        requests.push({ url, body: String(options?.body ?? "") });
        if (url.endsWith("/order/calc"))
          return Response.json({
            status: "success",
            data: {
              total: 1.8,
              balance: parameters.sellerBalance ?? 40,
              currency: "USD",
            },
          });
        if (url.endsWith("/order/make"))
          return Response.json({
            status: "success",
            data: { orderId: "order-456" },
          });
        return Response.json({
          status: "success",
          data: {
            items: [
              {
                ip: "192.0.2.2",
                port_socks: 1080,
                port_http: 8080,
                login: "seller-user",
                password: "seller-password",
              },
            ],
          },
        });
      }
      return original(input, options);
    };
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof ProxyProvidersDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openProvider(
  canvasElement: HTMLElement,
  userEvent: { click: UserEvent["click"] },
  name: string,
  action: string,
) {
  const dialog = await settledDialog(canvasElement);
  await userEvent.click(dialog.getByRole("radio", { name: new RegExp(name) }));
  await userEvent.click(dialog.getByRole("button", { name: action }));
  return dialog;
}

export const ImportExisting: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await openProvider(
      canvasElement,
      userEvent,
      "Webshare",
      "Connect Webshare",
    );
    const next = dialog.getByRole("button", { name: "Continue" });
    await expect(next).toBeDisabled();
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(next);
    await expect(requests).toHaveLength(0);
    await userEvent.click(dialog.getByRole("button", { name: "Load proxies" }));
    await expect(
      await dialog.findByText(
        "1 proxy is ready to import. Existing entries will be skipped.",
      ),
    ).toBeVisible();
    await expect(dialog.getByText("192.0.2.1:1080")).toBeVisible();
    await expect(dialog.queryByText("test-password")).not.toBeInTheDocument();
    await expect(args.onImport).not.toHaveBeenCalled();
    await userEvent.click(
      dialog.getByRole("button", { name: "Import 1 proxy" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith([
      {
        type: ProxyProto_Type.SOCKS5,
        address: "inet://192.0.2.1:1080",
        username: "test-user",
        password: "test-password",
      },
    ]);
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const PurchaseWithAffiliate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openProvider(
      canvasElement,
      userEvent,
      "Proxy-Seller",
      "Buy with Proxy-Seller",
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }));
    await expect(
      dialog.getByRole("button", { name: "Buy with provider balance" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByLabelText("Affiliate or discount code"),
    ).toHaveValue("SOULFIREMC");
    await userEvent.click(dialog.getByRole("button", { name: "Check price" }));
    const purchase = await dialog.findByRole("button", {
      name: "Purchase for 1.8 USD",
    });
    await expect(dialog.getByText("38.2 USD")).toBeVisible();
    await expect(
      requests.some((entry) => entry.url.endsWith("/order/make")),
    ).toBe(false);
    await userEvent.click(purchase);
    await expect(
      await dialog.findByText("Order order-456 created"),
    ).toBeVisible();
    const made = requests.filter((entry) => entry.url.endsWith("/order/make"));
    await expect(made).toHaveLength(1);
    await expect(JSON.parse(made[0].body!)).toMatchObject({
      coupon: "SOULFIREMC",
      paymentId: "balance",
    });
    await userEvent.click(dialog.getByRole("button", { name: "Load proxies" }));
    await expect(
      await dialog.findByRole("button", { name: "Import 1 proxy" }),
    ).toBeEnabled();
    await expect(requests[requests.length - 1]?.url).toContain(
      "orderId=order-456",
    );
  },
};

export const InsufficientBalanceOffersTopUp: Story = {
  parameters: { sellerBalance: 1 },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openProvider(
      canvasElement,
      userEvent,
      "Proxy-Seller",
      "Buy with Proxy-Seller",
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }));
    await expect(
      dialog.getByRole("button", { name: "Buy with provider balance" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(dialog.getByRole("button", { name: "Check price" }));
    await expect(
      await dialog.findByRole("button", { name: "Purchase for 1.8 USD" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Add funds at Proxy-Seller" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("partner=GRJY71PA3XWPPP"),
    );
  },
};

export const CheckoutOnlyProvider: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await settledDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: /Checkout only/ }),
    );
    await expect(dialog.queryByRole("radio", { name: /Webshare/ })).toBeNull();
    await userEvent.click(dialog.getByRole("radio", { name: /FlameProxies/ }));
    await expect(
      dialog.getByRole("button", { name: "Open FlameProxies checkout" }),
    ).toHaveAttribute("href", expect.stringContaining("referral=42M1SH76"));
    await expect(
      dialog.queryByRole("button", { name: /Connect|Buy with/ }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(dialog.getByText(/Buy on the provider's site/)).toBeVisible(),
    );
  },
};

export const ChangeProviderClearsCredentials: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await openProvider(
      canvasElement,
      userEvent,
      "Webshare",
      "Connect Webshare",
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(
      dialog.getByRole("button", { name: "All providers" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: /Thordata/ }));
    await expect(dialog.getByText("THORDATA")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Connect Thordata" }),
    );
    await expect(dialog.getByLabelText("API key")).toHaveValue("");
    await expect(dialog.getByLabelText("Account sign")).toBeVisible();
  },
};

export const DemoMode: Story = {
  args: { canImport: false },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await settledDialog(canvasElement);
    await waitFor(() =>
      expect(
        dialog.getByText(
          "Connect to a SoulFire server to purchase or import resources.",
        ),
      ).toBeVisible(),
    );
    await expect(
      dialog.getByRole("button", { name: "Create a Webshare account" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("referral_code=36gneippfiwt"),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Connect Webshare" }),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }));
    await expect(
      dialog.getByRole("button", { name: "Load proxies" }),
    ).toBeDisabled();
    await expect(requests).toHaveLength(0);
  },
};

export const FailedSaveRetainsLoadedProxies: Story = {
  args: { onImport: fn().mockRejectedValue(new Error("Server disconnected")) },
  play: async ({ args, canvasElement, userEvent }) => {
    mocked(args.onImport).mockRejectedValueOnce(
      new Error("Server disconnected"),
    );
    const dialog = await openProvider(
      canvasElement,
      userEvent,
      "Webshare",
      "Connect Webshare",
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Continue" }));
    await userEvent.click(dialog.getByRole("button", { name: "Load proxies" }));
    const importButton = await dialog.findByRole("button", {
      name: "Import 1 proxy",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await userEvent.click(importButton);
    await expect(args.onImport).toHaveBeenCalledTimes(1);
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Could not save proxies to this project.",
    );
    await expect(
      dialog.getByRole("button", { name: "Import 1 proxy" }),
    ).toBeEnabled();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
