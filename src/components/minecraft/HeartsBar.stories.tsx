import type { Meta, StoryObj } from "@storybook/react-vite";
import { HeartsBar } from "./vitals";

const meta = {
  title: "Bots/Vitals/Health",
  component: HeartsBar,
  args: { health: 20, maxHealth: 20 },
  argTypes: {
    health: { control: { type: "range", min: 0, max: 20, step: 0.5 } },
    maxHealth: { control: { type: "range", min: 2, max: 20, step: 2 } },
  },
} satisfies Meta<typeof HeartsBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Injured: Story = { args: { health: 13 } };
export const Critical: Story = { args: { health: 1 } };
export const Dead: Story = { args: { health: 0 } };
export const ReducedMaximum: Story = { args: { health: 5, maxHealth: 10 } };
