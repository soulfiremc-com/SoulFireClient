import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { BotDialogForm } from "./bot-dialog-form";
import { ServerDialogSchema } from "@/generated/soulfire/bot_pb";

const dialog = create(ServerDialogSchema, {
  id: "storybook:server-settings",
  screenId: "storybook-screen",
  title: "Configure your session",
  canCloseWithEscape: true,
  body: [
    {
      element: {
        case: "plainMessage",
        value: { contents: "Choose the settings for this bot before joining." },
      },
    },
  ],
  inputs: [
    {
      input: {
        case: "text",
        value: {
          key: "name",
          label: "Display name",
          labelVisible: true,
          initial: "Explorer",
          maxLength: 32,
        },
      },
    },
    {
      input: {
        case: "text",
        value: {
          key: "notes",
          label: "Notes",
          labelVisible: true,
          initial: "Follow the marked path.",
          maxLength: 256,
          multiline: true,
          multilineMaxLines: 3,
        },
      },
    },
    {
      input: {
        case: "boolean",
        value: {
          key: "rules",
          label: "Accept the server rules",
          initial: false,
        },
      },
    },
    {
      input: {
        case: "singleOption",
        value: {
          key: "mode",
          label: "Game mode",
          labelVisible: true,
          initialOptionId: "survival",
          options: [
            { id: "survival", display: "Survival" },
            { id: "creative", display: "Creative" },
          ],
        },
      },
    },
    {
      input: {
        case: "numberRange",
        value: {
          key: "distance",
          label: "Follow distance",
          start: 1,
          end: 16,
          initial: 3,
        },
      },
    },
  ],
  actions: [{ label: "Join server" }],
});

const meta = {
  title: "Bots/Server dialog",
  component: BotDialogForm,
  args: {
    dialog,
    pending: false,
    onSubmit:
      fn<Parameters<typeof BotDialogForm>[0]["onSubmit"]>().mockResolvedValue(
        undefined,
      ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BotDialogForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllInputs: Story = {};

export const SubmitEditedInputs: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Display name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Trailblazer");
    await userEvent.click(canvas.getByRole("checkbox"));
    await userEvent.click(canvas.getByRole("combobox"));
    // Select options render in a portal outside the story's canvas.
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "Creative",
      }),
    );
    const distance = canvas.getByRole("spinbutton");
    await userEvent.clear(distance);
    await userEvent.type(distance, "4.5");
    await userEvent.click(canvas.getByRole("button", { name: "Join server" }));
    await expect(args.onSubmit).toHaveBeenCalledWith(0, {
      name: "Trailblazer",
      notes: "Follow the marked path.",
      rules: "true",
      mode: "creative",
      distance: "4.5",
    });
  },
};

export const Pending: Story = {
  args: { pending: true },
  play: async ({ args, canvas, userEvent }) => {
    const submit = canvas.getByRole("button", { name: "Join server" });
    await expect(submit).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Dismiss" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("textbox", { name: "Display name" }),
    );
    await userEvent.keyboard("{Enter}");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const DismissInvalidNumber: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.clear(canvas.getByRole("spinbutton"));
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onSubmit).toHaveBeenCalledWith(-1, {
      name: "Explorer",
      notes: "Follow the marked path.",
      rules: "false",
      mode: "survival",
    });
  },
};

export const FailedSubmission: Story = {
  args: {
    onSubmit: fn<
      Parameters<typeof BotDialogForm>[0]["onSubmit"]
    >().mockRejectedValue(new Error("The server is unavailable")),
  },
  play: async ({ args, canvas, userEvent }) => {
    const name = canvas.getByRole("textbox", { name: "Display name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Keep this draft");
    const submit = canvas.getByRole("button", { name: "Join server" });
    await userEvent.click(submit);
    await expect(name).toHaveValue("Keep this draft");
    await userEvent.click(submit);
    await expect(args.onSubmit).toHaveBeenCalledTimes(2);
    await expect(args.onSubmit).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ name: "Keep this draft" }),
    );
  },
};
