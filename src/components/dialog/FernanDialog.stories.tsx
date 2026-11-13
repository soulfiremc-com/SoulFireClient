import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";

type UserEvent = ReturnType<typeof import("storybook/test").userEvent.setup>;
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import AccountProvidersDialog from "./account-providers-dialog.tsx";
import { settledDialog } from "./provider-story-helpers.ts";

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
  component: AccountProvidersDialog,
  args: {
    open: true,
    initialProviderId: "fernan",
    canPurchase: true,
    onOpenChange: fn(),
    onImport: fn(),
  },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    purchases.length = 0;
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (!url.startsWith("https://api.fernan.club/"))
        return original(input, options);
      const path = new URL(url).pathname;
      let data: unknown;
      if (path.endsWith("/me"))
        data = { balance: parameters.lowBalance ? 50 : 1_000 };
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
        if (parameters.purchaseFails) return new Response("", { status: 502 });
        data = delivery;
      } else data = { purchase: delivery };
      return Response.json({ success: true, data });
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
  await userEvent.type(dialog.getByLabelText("API key"), "test-key");
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Connect" })).toBeEnabled(),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Connect" }));
  await dialog.findByRole("heading", { name: "Choose your accounts" });
  return dialog;
}

export const PurchaseWithReferral: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await dialog.findByText("1,000");
    const review = dialog.getByRole("button", { name: "Review order" });
    await expect(review).toBeDisabled();
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await expect(dialog.getByLabelText("Referral code")).toHaveValue(
      "SOULFIRE",
    );
    await userEvent.click(review);
    await expect(purchases).toHaveLength(0);
    await expect(dialog.getByText("Listed total")).toBeVisible();

    // Going back keeps the order, and nothing is charged until confirmation.
    await userEvent.click(dialog.getByRole("button", { name: "Back" }));
    await expect(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    ).toBeChecked();
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Buy 1 account" }),
    );

    await expect(await dialog.findByText("Purchase complete")).toBeVisible();
    await expect(purchases).toEqual([
      { product_id: 1, amount: 1, referral_code: "SOULFIRE" },
    ]);
    await expect(dialog.getByText(/1 account delivered/)).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Import 1 account" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith(
      ["test-access-token"],
      AccountTypeCredentials.MICROSOFT_JAVA_ACCESS_TOKEN,
    );
    await expect(args.onOpenChange).toHaveBeenCalledWith(false);
  },
};

export const RemovedReferralIsNotSent: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Remove code" }));
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Buy 1 account" }),
    );
    await dialog.findByText("Purchase complete");
    await expect(purchases).toEqual([{ product_id: 1, amount: 1 }]);
  },
};

export const RecoverEarlierOrder: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await userEvent.click(
      dialog.getByRole("button", { name: "Use an earlier order" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: new RegExp(id) }));
    await userEvent.click(dialog.getByRole("button", { name: "Load order" }));
    await expect(await dialog.findByText("Order loaded")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("radio", { name: "Microsoft Cookies" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Import 1 account" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith(
      ["cookie-data"],
      AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
    );
    await expect(purchases).toHaveLength(0);
  },
};

export const Cooldown: Story = {
  parameters: { cooling: true },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await expect(dialog.getByText("On cooldown")).toBeVisible();
    await expect(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.getByRole("button", { name: "Review order" }),
    ).toBeDisabled();
    await expect(purchases).toHaveLength(0);
  },
};

export const LowBalanceOffersTopUp: Story = {
  parameters: { lowBalance: true },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await expect(dialog.getByText("Add funds to continue")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add funds at Fernan's Club" }),
    ).toHaveAttribute("href", "https://fernan.club");
    await expect(
      dialog.getByRole("button", { name: "Review order" }),
    ).toBeDisabled();
  },
};

export const UncertainPurchaseLocksRetry: Story = {
  parameters: { purchaseFails: true },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await connect(canvasElement, userEvent);
    await userEvent.click(
      dialog.getByRole("radio", { name: /Cookie accounts/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    const buy = dialog.getByRole("button", { name: "Buy 1 account" });
    await userEvent.click(buy);
    await expect(
      await dialog.findByText("Check your orders before buying again"),
    ).toBeVisible();
    await expect(buy).toBeDisabled();
    await userEvent.click(
      dialog.getByRole("button", { name: "Check recent orders" }),
    );
    await dialog.findByRole("heading", { name: "Choose your accounts" });
    await expect(
      dialog.getByRole("radio", { name: new RegExp(id) }),
    ).toBeVisible();
    await expect(purchases).toHaveLength(1);
  },
};
