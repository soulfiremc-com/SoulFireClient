import type { Meta, StoryObj } from "@storybook/react-vite";
import { Code, ConnectError } from "@connectrpc/connect";
import { expect, fn, within } from "storybook/test";
import { ProxyProto_Type } from "@/generated/soulfire/common_pb";
import { ProxyImportReview } from "./proxy-import-review";

const meta = {
  title: "Proxies/Import review",
  component: ProxyImportReview,
  args: {
    text: "socks5://localhost:1080\nhttps://localhost:1080",
    type: "uri",
    onBack: fn<() => void>(),
    onImport: fn(),
  },
} satisfies Meta<typeof ProxyImportReview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ImportValidLinesAndSkipRejected: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const submit = await body.findByRole("button", {
      name: "Import 1 proxy",
    });
    await expect(body.getByRole("alert")).toHaveTextContent(
      "1 line could not be parsed and will be skipped: line 2.",
    );
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await expect(args.onImport).toHaveBeenCalledWith(
      [{ type: 2, address: "inet://localhost:1080" }],
      1,
      0,
    );
  },
};

export const SkipProxiesAlreadyInProject: Story = {
  args: {
    text: "socks5://localhost:1080\nsocks5://localhost:1080\nsocks5://localhost:1081",
    existingProxies: [
      { type: ProxyProto_Type.SOCKS5, address: "inet://localhost:1080" },
    ],
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText(/1 proxy is already in this project/u),
    ).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Import 2 proxies" }),
    );
    // A repeated line stays when the project has only one copy of it.
    await expect(args.onImport).toHaveBeenCalledWith(
      [
        { type: 2, address: "inet://localhost:1080" },
        { type: 2, address: "inet://localhost:1081" },
      ],
      0,
      1,
    );
  },
};

export const CorrectRejectedLines: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole("button", { name: "Import 1 proxy" });
    const input = body.getByRole("textbox", { name: "Proxy list" });
    await userEvent.clear(input);
    await userEvent.type(
      input,
      "socks5://user:secret@localhost:1080{enter}socks5://localhost:1081",
    );
    await expect(body.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Import 2 proxies" }),
    );
    await expect(args.onImport).toHaveBeenCalledWith(
      [
        {
          type: 2,
          address: "inet://localhost:1080",
          username: "user",
          password: "secret",
        },
        { type: 2, address: "inet://localhost:1081" },
      ],
      0,
      0,
    );
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
    const submit = await body.findByRole("button", { name: "Import 1 proxy" });
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
