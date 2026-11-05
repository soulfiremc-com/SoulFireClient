import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";

type UserEvent = ReturnType<typeof import("storybook/test").userEvent.setup>;
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import AccountProvidersDialog from "./account-providers-dialog.tsx";
import { settledDialog } from "./provider-story-helpers.ts";

const purchases: string[] = [];
const meta = {
  title: "Providers/Localts accounts",
  component: AccountProvidersDialog,
  args: {
    open: true,
    initialProviderId: "localts",
    canPurchase: true,
    onOpenChange: fn(),
    onImport: fn(),
  },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    purchases.length = 0;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (!url.startsWith("https://localts.store/v1/"))
        return original(input, options);
      if (url.endsWith("/products") && parameters.catalogFails)
        return new Response("", { status: 500 });
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
              quantityDiscounts: { 10: 20 },
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
} satisfies Meta<typeof AccountProvidersDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

async function connect(
  canvasElement: HTMLElement,
  userEvent: { type: UserEvent["type"]; click: UserEvent["click"] },
) {
  const dialog = await settledDialog(canvasElement);
  await dialog.findByText("Cookie accounts");
  await userEvent.type(dialog.getByLabelText("API key"), "test-key");
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Connect" })).toBeEnabled(),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Connect" }));
  await dialog.findByRole("heading", { name: "Choose your accounts" });
  return dialog;
}

export const PurchaseAndImport: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await expect(dialog.getByText("100 credits")).toBeVisible();
    await expect(dialog.getByText("20% off from 10")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    await expect(purchases).toHaveLength(0);
    await userEvent.click(
      dialog.getByRole("button", { name: "Pay 10 credits" }),
    );
    await expect(await dialog.findByText("Purchase complete")).toBeVisible();
    await expect(purchases).toHaveLength(1);
    await expect(
      await dialog.findByText("Order status: COMPLETE. 1 delivered item."),
    ).toBeVisible();
    const importButton = dialog.getByRole("button", {
      name: "Import 1 account",
    });
    await expect(importButton).toBeDisabled();
    await userEvent.click(
      dialog.getByRole("radio", { name: "Localts MSAAUTH cookie tokens" }),
    );
    await userEvent.click(importButton);
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

async function recover(
  canvasElement: HTMLElement,
  userEvent: { type: UserEvent["type"]; click: UserEvent["click"] },
) {
  const dialog = await connect(canvasElement, userEvent);
  await userEvent.click(
    dialog.getByRole("button", { name: "Use an earlier order" }),
  );
  await userEvent.click(dialog.getByRole("radio", { name: /order-123/ }));
  await userEvent.click(dialog.getByRole("button", { name: "Load order" }));
  return dialog;
}

export const PendingOrder: Story = {
  parameters: { deliveryState: "pending" },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await recover(canvasElement, userEvent);
    await expect(
      await dialog.findByText("Your order is still being packaged"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Check delivery" }),
    ).toBeEnabled();
    await expect(args.onImport).not.toHaveBeenCalled();
    await expect(purchases).toHaveLength(0);
  },
};

export const RefundedOrder: Story = {
  parameters: { deliveryState: "refunded" },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await recover(canvasElement, userEvent);
    await expect(
      await dialog.findByText("This order was refunded"),
    ).toBeVisible();
    await expect(
      dialog.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();
    await expect(args.onImport).not.toHaveBeenCalled();
  },
};

export const CatalogLoadFailure: Story = {
  parameters: { catalogFails: true },
  play: async ({ canvasElement }) => {
    const dialog = await settledDialog(canvasElement);
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Could not reach the provider",
    );
    await expect(dialog.getByLabelText("API key")).toBeEnabled();
  },
};

export const DemoModeCannotPurchase: Story = {
  args: { canPurchase: false },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    await expect(
      dialog.getByRole("button", { name: "Pay 10 credits" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText(
        "Connect to a Soulfire server to purchase or import resources.",
      ),
    ).toBeVisible();
    await expect(purchases).toHaveLength(0);
  },
};
