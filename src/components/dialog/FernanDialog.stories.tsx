import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import FernanDialog from "./fernan-dialog.tsx";

const id = "550e8400-e29b-41d4-a716-446655440000";
const purchases: Record<string, unknown>[] = [];
const delivery = {
  purchase_id: id,
  products: [{ data: btoa("cookie-data"), access_token: "test-access-token" }],
  balance_after: 900,
  total_cost: 100,
};
const meta = {
  title: "Providers/Fernan accounts",
  component: FernanDialog,
  args: { canPurchase: true, onClose: fn(), onImport: fn() },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    purchases.length = 0;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (!url.startsWith("https://api.fernan.club/"))
        return original(input, options);
      const path = new URL(url).pathname;
      let data: unknown;
      if (path.endsWith("/me")) data = { balance: 1_000 };
      else if (path.endsWith("/stock"))
        data = {
          stock: [
            {
              product_id: 1,
              product_name: "Cookie accounts",
              category: "cookie",
              count: 20,
              price: 100,
              purchase_limit: 5,
            },
          ],
        };
      else if (path.endsWith("/cooldown"))
        data = {
          cooldowns: [
            {
              product_id: 1,
              remaining_allowed: parameters.cooling ? 0 : 5,
              on_cooldown: parameters.cooling ?? false,
            },
          ],
        };
      else if (path.endsWith("/purchases"))
        data = {
          purchases: [{ purchase_id: id, product_name: "Cookie accounts" }],
        };
      else if (path.endsWith("/purchase")) {
        purchases.push(JSON.parse(String(options?.body)));
        data = delivery;
      } else data = { purchase: delivery };
      return Response.json({ success: true, data });
    };
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof FernanDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PurchaseWithReferral: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Open Fernan's Club" }),
      ).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(
      dialog.getByRole("button", { name: "Connect and load recent orders" }),
    );
    await expect(await dialog.findByText("Fernan balance: 1000")).toBeVisible();
    await userEvent.click(dialog.getByRole("combobox", { name: "Product" }));
    await userEvent.click(
      await page.findByRole("option", { name: "Cookie accounts (20)" }),
    );
    await expect(
      dialog.getByLabelText("Affiliate or discount code"),
    ).toHaveValue("SOULFIRE");
    const buy = dialog.getByRole("button", { name: "Purchase 1 account" });
    await waitFor(() => expect(buy).toBeEnabled());
    await expect(purchases).toHaveLength(0);
    await userEvent.click(buy);
    await expect(await dialog.findByText("1 account delivered.")).toBeVisible();
    await expect(purchases).toEqual([
      { product_id: 1, amount: 1, referral_code: "SOULFIRE" },
    ]);
    await userEvent.click(
      dialog.getByRole("button", { name: "Import delivered accounts" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith(
      ["test-access-token"],
      AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
    );
  },
};

export const Cooldown: Story = {
  parameters: { cooling: true },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("button", { name: "Open Fernan's Club" }),
      ).toHaveFocus(),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await userEvent.click(
      dialog.getByRole("button", { name: "Connect and load recent orders" }),
    );
    await dialog.findByText("Fernan balance: 1000");
    await userEvent.click(dialog.getByRole("combobox", { name: "Product" }));
    await userEvent.click(
      await page.findByRole("option", { name: "Cookie accounts (20)" }),
    );
    await expect(
      dialog.getByRole("button", { name: "Purchase 1 account" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText(/You can purchase 0 accounts now/),
    ).toBeVisible();
    await expect(purchases).toHaveLength(0);
  },
};
