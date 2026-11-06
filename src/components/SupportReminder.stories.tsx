import type { Meta, StoryObj } from "@storybook/react-vite";
import { StrictMode, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { BotConnectionPhase } from "@/generated/soulfire/bot_pb";
import { createSupportReminder } from "@/lib/support-reminder";
import { SupportReminder } from "./support-reminder";

let reminder: ReturnType<typeof createSupportReminder>;
let now: number;
const firstUse = Date.UTC(2026, 0, 1, 12);
const day = 24 * 60 * 60 * 1000;
const spawned = { isOnline: true, connectionPhase: BotConnectionPhase.SPAWNED };

function OverviewExample({
  loading = false,
  cookies = false,
  dialog = false,
}: {
  loading?: boolean;
  cookies?: boolean;
  dialog?: boolean;
}) {
  const [visit, setVisit] = useState(0);
  const [ready, setReady] = useState(!loading);
  const [cookiesOpen, setCookiesOpen] = useState(cookies);
  const [dialogOpen, setDialogOpen] = useState(dialog);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setVisit((value) => value + 1)}>
          Revisit overview
        </Button>
        <Button onClick={() => setReady(true)}>Finish loading</Button>
        <Button onClick={() => reminder.observeBots([spawned])}>
          Observe first spawn
        </Button>
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
      </div>
      <p>The overview remains usable while the support notice is visible.</p>
      <SupportReminder
        key={`visit-${visit}`}
        ready={ready}
        reminder={reminder}
      />
      {cookiesOpen && (
        <CookieConsentBanner
          onAccept={() => setCookiesOpen(false)}
          onDecline={() => setCookiesOpen(false)}
        />
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogTitle>Another task</DialogTitle>
          <DialogDescription>
            Finish this task before the support notice appears.
          </DialogDescription>
          <DialogClose render={<Button />}>Finish task</DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const meta = {
  title: "Support/Reminder",
  component: OverviewExample,
  beforeEach: ({ parameters }) => {
    now = firstUse;
    reminder = createSupportReminder({ now: () => now });
    if (!parameters.firstUse) {
      for (const offset of [0, 1, 14]) {
        now = firstUse + offset * day;
        reminder.recordUse();
      }
      if (!parameters.needsSpawn) reminder.observeBots([spawned]);
    }
  },
  decorators: [
    (Story) => (
      <StrictMode>
        <Story />
      </StrictMode>
    ),
  ],
} satisfies Meta<typeof OverviewExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoticeAndSnooze: Story = {
  play: async ({ canvas, userEvent }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("region", { name: "Support Soulfire" }),
      ).toBeVisible(),
    );
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBe(now);
    await expect(
      canvas.getByRole("button", { name: "Support Soulfire" }),
    ).toHaveAttribute(
      "href",
      "https://soulfiremc.com/pricing?utm_source=soulfire-client&utm_medium=app&utm_campaign=support-dialog",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Maybe later" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Revisit overview" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().disabled).toBeNull();
  },
};

export const FirstUse: Story = {
  parameters: { firstUse: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBeNull();
  },
};

export const WaitsForLaterVisit: Story = {
  parameters: { needsSpawn: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Observe first spawn" }),
    );
    await expect(reminder.isEligible()).toBe(true);
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Revisit overview" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("region", { name: "Support Soulfire" }),
      ).toBeVisible(),
    );
  },
};

export const DefersUntilReady: Story = {
  args: { loading: true },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish loading" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("region", { name: "Support Soulfire" }),
      ).toBeVisible(),
    );
  },
};

export const DefersForCookieChoice: Story = {
  args: { cookies: true },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("region", { name: "Analytics cookies" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("region", { name: "Support Soulfire" }),
      ).toBeVisible(),
    );
  },
};

export const DefersForOtherDialog: Story = {
  args: { dialog: true },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(page.getByRole("dialog", { name: "Another task" })).toBeVisible(),
    );
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().lastShownAt).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Finish task" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("region", { name: "Support Soulfire" }),
      ).toBeVisible(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
  },
};

export const NeverRemind: Story = {
  play: async ({ canvas, userEvent }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Don't remind me again" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Don't remind me again" }),
    );
    now += 1000 * day;
    await userEvent.click(
      canvas.getByRole("button", { name: "Revisit overview" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().disabled).toBe("never");
  },
};

export const ExistingSupporter: Story = {
  play: async ({ canvas, userEvent }) => {
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "I already support Soulfire" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "I already support Soulfire" }),
    );
    now += 1000 * day;
    await userEvent.click(
      canvas.getByRole("button", { name: "Revisit overview" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Support Soulfire" }),
    ).toBeNull();
    await expect(reminder.getSnapshot().disabled).toBe("supporter");
  },
};
