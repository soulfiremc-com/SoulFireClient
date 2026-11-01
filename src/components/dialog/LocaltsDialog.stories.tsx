import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import LocaltsDialog from "./localts-dialog.tsx";

const purchases: string[] = [];
const meta = {
  title: "Providers/Localts accounts",
  component: LocaltsDialog,
  args: { canPurchase: true, onClose: fn(), onImport: fn() },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    purchases.length = 0;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (!url.startsWith("https://localts.store/v1/"))
        return original(input, options);
      if (url.endsWith("/products"))
        return Response.json({
          success: true,
          products: [
            {
              id: "cookies",
              name: "Cookie accounts",
              category: "Minecraft",
              priceInCredits: 10,
              stock: 20,
              type: "Text",
            },
          ],
        });
      if (url.endsWith("/me"))
        return Response.json({ success: true, username: "test", balance: 100 });
      if (url.includes("/orders?page="))
        return Response.json({
          success: true,
          orders: [
            {
              id: "order-123",
              productId: "cookies",
              productType: "Text",
              timestamp: 1,
            },
          ],
        });
      if (url.includes("/purchase?")) {
        purchases.push(url);
        return Response.json({ success: true, orderId: "order-123" });
      }
      return Response.json({
        success: true,
        "order-id": "order-123",
        status:
          parameters.deliveryState === "pending" ? "PACKAGING" : "PACKAGED",
        "order-status":
          parameters.deliveryState === "refunded" ? "REFUNDED" : "COMPLETE",
        items: parameters.deliveryState
          ? []
          : [{ id: "item-1", content: "test-cookie-value" }],
      });
    };
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof LocaltsDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PurchaseAndImport: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Open Localts" }),
      ).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(
      dialog.getByRole("button", { name: "Connect and load recent orders" }),
    );
    await expect(
      await dialog.findByText("Available balance: 100 credits"),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("combobox", { name: "Product" }));
    await userEvent.click(
      await page.findByRole("option", { name: "Cookie accounts (20)" }),
    );
    const buy = dialog.getByRole("button", { name: "Purchase for 10 credits" });
    await waitFor(() => expect(buy).toBeEnabled());
    await expect(purchases).toHaveLength(0);
    await userEvent.click(buy);
    await expect(
      await dialog.findByText(/Order order-123 was created/),
    ).toBeVisible();
    await expect(purchases).toHaveLength(1);
    await userEvent.click(dialog.getByRole("button", { name: "Load order" }));
    await expect(
      await dialog.findByText("Order status: COMPLETE. 1 delivered item."),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Account format" }),
    );
    await userEvent.click(
      await page.findByRole("option", {
        name: "Localts MSAAUTH cookie tokens",
      }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Import delivered accounts" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith(
      [
        JSON.stringify([
          {
            domain: "login.live.com",
            name: "__Host-MSAAUTHP",
            value: "test-cookie-value",
          },
        ]),
      ],
      AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
    );
  },
};

export const PendingOrder: Story = {
  parameters: { deliveryState: "pending" },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Open Localts" }),
      ).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.type(dialog.getByLabelText("Order ID"), "order-123");
    await userEvent.click(dialog.getByRole("button", { name: "Load order" }));
    await expect(
      await dialog.findByText("Order status: COMPLETE. 0 delivered items."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Import delivered accounts" }),
    ).toBeDisabled();
    await expect(args.onImport).not.toHaveBeenCalled();
    await expect(purchases).toHaveLength(0);
  },
};

export const RefundedOrder: Story = {
  parameters: { deliveryState: "refunded" },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Open Localts" }),
      ).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.type(dialog.getByLabelText("Order ID"), "order-123");
    await userEvent.click(dialog.getByRole("button", { name: "Load order" }));
    await expect(
      await dialog.findByText("Order status: REFUNDED. 0 delivered items."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Import delivered accounts" }),
    ).toBeDisabled();
    await expect(args.onImport).not.toHaveBeenCalled();
  },
};
