import type { Meta, StoryObj } from "@storybook/react-vite";
import { TrashIcon } from "lucide-react";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import { ConfirmDialog } from "./confirm-dialog.tsx";

function ConfirmDialogHarness(props: {
  onConfirm: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      icon={<TrashIcon />}
      title="Remove 2 users?"
      description="This permanently removes the selected users."
      confirmLabel="Remove"
      onConfirm={props.onConfirm}
    />
  );
}

const meta = {
  title: "Dialogs/Confirm dialog",
  component: ConfirmDialogHarness,
  args: { onConfirm: fn() },
} satisfies Meta<typeof ConfirmDialogHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ClosesAfterSyncConfirm: Story = {
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove" }),
    );
    await expect(args.onConfirm).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  },
};

let resolvePending: () => void = () => undefined;

export const StaysOpenWhileConfirmIsPending: Story = {
  args: {
    onConfirm: fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePending = resolve;
        }),
    ),
  },
  play: async ({ args }) => {
    const confirm = await screen.findByRole("button", { name: "Remove" });
    await userEvent.click(confirm);

    await expect(args.onConfirm).toHaveBeenCalledOnce();
    await expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await expect(confirm).toBeDisabled();
    await expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePending();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  },
};
