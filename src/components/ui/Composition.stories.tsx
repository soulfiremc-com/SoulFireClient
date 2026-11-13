import type { Meta, StoryObj } from "@storybook/react-vite";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { expect, fn, within } from "storybook/test";
import {
  Editable,
  EditableInput,
  EditableLabel,
  EditablePreview,
} from "./editable";
import { QRCode, QRCodeImage } from "./qr-code";
import { Scroller } from "./scroller";

const meta = {
  title: "UI/Base composition",
  component: Editable,
  args: { defaultValue: "Initial name", onSubmit: fn() },
} satisfies Meta<typeof Editable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditAndCancel: Story = {
  render: (args) => (
    <DirectionProvider direction="rtl">
      <Editable {...args} render={<section data-testid="editor" />}>
        <EditableLabel>Display name</EditableLabel>
        <EditablePreview render={<span />} />
        <EditableInput />
      </Editable>
    </DirectionProvider>
  ),
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("editor")).toHaveAttribute("dir", "rtl");
    await userEvent.click(canvas.getByRole("button", { name: "Initial name" }));
    const input = canvas.getByRole("textbox", { name: "Display name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Updated name{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledWith("Updated name");
    await userEvent.click(canvas.getByRole("button", { name: "Updated name" }));
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "Discarded{Escape}");
    await expect(
      canvas.getByRole("button", { name: "Updated name" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};

export const QrImage: Story = {
  render: () => (
    <QRCode value="https://soulfiremc.com" render={<figure />}>
      <QRCodeImage alt="Connection code" />
    </QRCode>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("img", { name: "Connection code" }),
    ).toHaveAttribute("src", expect.stringContaining("data:image/png"));
  },
};

export const ScrollContainers: Story = {
  render: () => (
    <>
      <Scroller render={<section aria-label="Logs" />}>Server ready</Scroller>
      <Scroller withNavigation render={<section aria-label="History" />}>
        Previous run
      </Scroller>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("region", { name: "Logs" }),
    ).toHaveTextContent("Server ready");
    await expect(
      canvas.getByRole("region", { name: "History" }),
    ).toHaveTextContent("Previous run");
  },
};
