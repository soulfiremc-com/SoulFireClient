import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor } from "storybook/test";
import { AccountTypeCredentials } from "@/generated/soulfire/common_pb";
import AccountProvidersDialog from "./account-providers-dialog.tsx";
import { settledDialog } from "./provider-story-helpers.ts";

const purchases: string[] = [];
const meta = {
  title: "Providers/Account providers",
  component: AccountProvidersDialog,
  args: {
    open: true,
    canPurchase: true,
    onOpenChange: fn(),
    onImport: fn(),
  },
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    purchases.length = 0;
    localStorage.removeItem("ravealts-api-key");
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url.endsWith("/alts/stock"))
        return Response.json({ status: "success", stock: { cookie_nfa: 3 } });
      if (url.endsWith("/alts/key-info"))
        return Response.json({ status: "success", available_credits: 500 });
      if (url.endsWith("/alts/purchase")) {
        purchases.push(String(options?.body));
        if (parameters.purchaseFailure === "server")
          return Response.json(
            {
              status: "error",
              error_type: "server_error",
              message: "private details",
            },
            { status: 502 },
          );
        if (parameters.purchaseFailure === "malformed")
          return Response.json({ status: "success" });
        return Response.json({
          status: "success",
          accounts: [{ cookie: "cookie-data", filename: "a.txt" }],
        });
      }
      return original(input, options);
    };
    return () => {
      globalThis.fetch = original;
    };
  },
} satisfies Meta<typeof AccountProvidersDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ComparesCapabilities: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = await settledDialog(canvasElement);
    await userEvent.click(dialog.getByRole("radio", { name: /KynoSelling/ }));
    await expect(
      dialog.getByRole("button", { name: "Open KynoSelling checkout" }),
    ).toHaveAttribute("href", "https://kynoselling.xyz/?ref=SOULFIRE");
    await expect(dialog.getByText("SOULFIRE10")).toBeVisible();
    await userEvent.click(dialog.getByRole("radio", { name: /Localts/ }));
    await expect(
      dialog.getByRole("button", { name: "Create a Localts account" }),
    ).toHaveAttribute("href", "https://localts.store/?campaign=soulfire");
    await expect(dialog.getByText(/do not send a code/)).toBeVisible();
  },
};

export const RavealtsPurchaseImportsImmediately: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await settledDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: "Buy with Ravealts" }),
    );
    await dialog.findByText("Cookie Nfa: 3");
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Connect" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Connect" }));
    await userEvent.click(
      await dialog.findByRole("radio", { name: /Cookie Nfa/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    await expect(purchases).toHaveLength(0);
    await expect(dialog.getByText(/does not report the price/)).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Buy 1 account" }),
    );
    await expect(await dialog.findByText("Purchase complete")).toBeVisible();
    await expect(JSON.parse(purchases[0])).toEqual({
      user_request: { account_type: "cookie_nfa", amount: 1 },
    });
    await expect(args.onImport).toHaveBeenCalledWith(
      ["cookie-data"],
      AccountTypeCredentials.MICROSOFT_JAVA_COOKIES,
    );
  },
};

export const UncertainRavealtsPurchase: Story = {
  parameters: { purchaseFailure: "server" },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = await settledDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: "Buy with Ravealts" }),
    );
    await userEvent.type(dialog.getByLabelText("API key"), "test-key");
    await waitFor(() =>
      expect(dialog.getByRole("button", { name: "Connect" })).toBeEnabled(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Connect" }));
    await userEvent.click(
      await dialog.findByRole("radio", { name: /Cookie Nfa/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Review order" }));
    const buy = dialog.getByRole("button", { name: "Buy 1 account" });
    await userEvent.click(buy);
    await waitFor(() => expect(buy).toBeDisabled());
    await expect(
      await dialog.findByText(
        "The purchase result could not be confirmed. Check your provider orders before placing another order.",
      ),
    ).toBeVisible();
    await expect(purchases).toHaveLength(1);
    await expect(args.onImport).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Back" }));
    await expect(
      dialog.getByRole("button", { name: "Review order" }),
    ).toBeDisabled();
  },
};

export const MalformedRavealtsDelivery: Story = {
  ...UncertainRavealtsPurchase,
  parameters: { purchaseFailure: "malformed" },
};
