import type { Meta, StoryObj } from "@storybook/react-vite";
import { FoodBar } from "./vitals";

const meta = {
  title: "Bots/Vitals/Food",
  component: FoodBar,
  args: { foodLevel: 20 },
  argTypes: {
    foodLevel: { control: { type: "range", min: 0, max: 20, step: 1 } },
  },
} satisfies Meta<typeof FoodBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Hungry: Story = { args: { foodLevel: 13 } };
export const Starving: Story = { args: { foodLevel: 1 } };
export const Empty: Story = { args: { foodLevel: 0 } };
