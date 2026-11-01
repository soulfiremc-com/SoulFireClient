import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SCRIPT_TEMPLATES } from "@/lib/script-templates.ts";
import { ScriptTemplatePicker } from "./ScriptTemplatePicker.tsx";

const meta = {
  title: "Scripts/Template picker",
  component: ScriptTemplatePicker,
  args: { templates: SCRIPT_TEMPLATES, onPick: fn() },
} satisfies Meta<typeof ScriptTemplatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllTemplates: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: /Respawn after death/,
      }),
    );
    await expect(args.onPick).toHaveBeenCalledWith(
      SCRIPT_TEMPLATES.find((template) => template.id === "respawn-on-death"),
    );
  },
};

export const Creating: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    for (const button of within(canvasElement).getAllByRole("button")) {
      await expect(button).toBeDisabled();
    }
  },
};
