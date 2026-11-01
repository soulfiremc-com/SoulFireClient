import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, mocked, within, waitFor } from "storybook/test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import ProxyProvidersDialog from "./proxy-providers-dialog.tsx";

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
  beforeEach: () => {
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
            data: { total: 1.8, balance: 40, currency: "USD" },
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

export const ImportExisting: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveFocus(),
    );
    const load = dialog.getByRole("button", { name: "Load proxies" });
    await expect(load).toBeDisabled();
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(load);
    await expect(
      await dialog.findByText(
        "1 proxy is ready to import. Existing entries will be skipped.",
      ),
    ).toBeVisible();
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
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveFocus(),
    );
    await userEvent.click(dialog.getByRole("combobox", { name: "Provider" }));
    await userEvent.click(
      await page.findByRole("option", { name: "Proxy-Seller" }),
    );
    await userEvent.click(dialog.getByRole("combobox", { name: "Action" }));
    await userEvent.click(
      await page.findByRole("option", { name: "Buy with provider balance" }),
    );
    await expect(
      dialog.getByLabelText("Affiliate or discount code"),
    ).toHaveValue("SOULFIREMC");
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(dialog.getByRole("button", { name: "Check price" }));
    const purchase = await dialog.findByRole("button", {
      name: "Purchase for 1.8 USD",
    });
    await expect(
      requests.some((entry) => entry.url.endsWith("/order/make")),
    ).toBe(false);
    await userEvent.click(purchase);
    await expect(
      await dialog.findByText(/Order order-456 was created/),
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

export const DemoMode: Story = {
  args: { canImport: false },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await expect(
      dialog.getByRole("button", { name: "Load proxies" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText(
        "Connect to a SoulFire server to purchase or import resources.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Open Webshare" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("referral_code=36gneippfiwt"),
    );
    await expect(requests).toHaveLength(0);
  },
};

export const FailedSaveRetainsLoadedProxies: Story = {
  args: { onImport: fn().mockRejectedValue(new Error("Server disconnected")) },
  play: async ({ args, canvasElement, userEvent }) => {
    mocked(args.onImport).mockRejectedValueOnce(
      new Error("Server disconnected"),
    );
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(dialog.getByRole("button", { name: "Load proxies" }));
    const importButton = await dialog.findByRole("button", {
      name: "Import 1 proxy",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await userEvent.click(importButton);
    await expect(args.onImport).toHaveBeenCalledTimes(1);
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Could not save proxies to this instance.",
    );
    await expect(
      dialog.getByRole("button", { name: "Import 1 proxy" }),
    ).toBeEnabled();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
