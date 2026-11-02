import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { page } from "@vitest/browser/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

function OverlayExample({ kind }: { kind: "popover" | "dropdown" }) {
  return kind === "popover" ? (
    <Popover>
      <PopoverTrigger render={<Button />}>Open details</PopoverTrigger>
      <PopoverContent className="w-96">
        <PopoverTitle>Details</PopoverTitle>
        {Array.from({ length: 30 }, (_, id) => (
          <p key={`detail-${id}`}>Detail {id + 1}</p>
        ))}
      </PopoverContent>
    </Popover>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        Choose language
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-96">
        <DropdownMenuGroup>
          <DropdownMenuItem>English</DropdownMenuItem>
          <DropdownMenuItem>Deutsch</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: "Layout/Overlay boundaries",
  component: OverlayExample,
  args: { kind: "popover" },
  beforeEach: async () => {
    if (!page) return;
    const original = { width: innerWidth, height: innerHeight };
    await page.viewport(320, 480);
    return () => page.viewport(original.width, original.height);
  },
} satisfies Meta<typeof OverlayExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PopoverFitsSmallScreen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Open details" }),
    );
    const title = await within(document.body).findByText("Details", {
      exact: true,
    });
    const popup = title.closest<HTMLElement>('[data-slot="popover-content"]')!;
    await waitFor(() => {
      const rect = popup.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(innerWidth);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(innerHeight);
    });
    popup.scrollTop = popup.scrollHeight;
    await waitFor(() => expect(popup.scrollTop).toBeGreaterThan(0));
    const last = within(popup).getByText("Detail 30").getBoundingClientRect();
    expect(last.bottom).toBeLessThanOrEqual(
      popup.getBoundingClientRect().bottom,
    );
  },
};

export const LanguageMenuFitsSmallScreen: Story = {
  args: { kind: "dropdown" },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Choose language" }),
    );
    const menu = await within(document.body).findByRole("menu");
    await waitFor(() => {
      const rect = menu.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(innerWidth);
    });
  },
};
