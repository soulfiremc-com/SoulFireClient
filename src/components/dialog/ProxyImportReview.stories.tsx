import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, ConnectError } from "@connectrpc/connect";
import { expect, fn, within } from "storybook/test";
import { ProxyImportReview } from "./proxy-import-review";

const meta = {
  title: "Proxies/Import review",
  component: ProxyImportReview,
  args: {
    text: "socks5://localhost:1080\nhttps://localhost:1080",
    type: "uri",
    onBack: fn(),
    onImport: fn(),
  },
} satisfies Meta<typeof ProxyImportReview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CorrectRejectedLines: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submit = await body.findByRole("button", { name: "Import proxies" });
    await expect(submit).toBeDisabled();
    await expect(body.getByRole("alert")).toHaveTextContent("Correct line 2");
    await expect(args.onImport).not.toHaveBeenCalled();
    const input = body.getByRole("textbox", { name: "Proxy list" });
    await userEvent.clear(input);
    await userEvent.type(input, "socks5://user:secret@localhost:1080");
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onImport).toHaveBeenCalledWith([
      {
        type: 2,
        address: "inet://localhost:1080",
        username: "user",
        password: "secret",
      },
    ]);
  },
};

export const FailedImportPreservesDraft: Story = {
  args: {
    text: "socks5://localhost:1080",
    onImport: fn(async () => {
      throw new ConnectError("Denied", Code.PermissionDenied);
    }),
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submit = await body.findByRole("button", { name: "Import proxies" });
    await userEvent.click(submit);
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "You do not have permission",
    );
    await expect(body.getByRole("textbox", { name: "Proxy list" })).toHaveValue(
      args.text,
    );
    await expect(submit).toBeEnabled();
  },
};
