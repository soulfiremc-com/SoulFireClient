import { create } from "@bufbuild/protobuf";
import { createRouterTransport } from "@connectrpc/connect";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import {
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from "@/components/command-palette";
import { AboutContext } from "@/components/dialog/about-dialog";
import { CreateInstanceContext } from "@/components/dialog/create-instance-dialog";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TransportContext } from "@/components/providers/transport-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ClientDataResponseSchema } from "@/generated/soulfire/client_pb";
import {
  GlobalPermission,
  InstancePermission,
} from "@/generated/soulfire/common_pb";
import {
  InstanceInfoSchema,
  InstanceListResponseSchema,
} from "@/generated/soulfire/instance_pb";
import { ScriptService } from "@/generated/soulfire/script_pb";
import type { InstanceInfoQueryData } from "@/lib/types";

const createProject = fn();
const loadProjects = fn();
const permissions = [
  InstancePermission.READ_INSTANCE,
  InstancePermission.READ_BOT_INFO,
  InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
];
const projectData = create(InstanceListResponseSchema, {
  instances: [
    {
      id: "farm",
      friendlyName: "Test farm",
      instancePermissions: permissions.map((instancePermission) => ({
        instancePermission,
        granted: true,
      })),
    },
  ],
});
const current: InstanceInfoQueryData = {
  ...create(InstanceInfoSchema, {
    friendlyName: "Test farm",
    instancePermissions: projectData.instances[0].instancePermissions,
  }),
  id: "farm",
  profile: { accounts: [], proxies: [], settings: {} },
};
const transport = createRouterTransport((router) =>
  router.service(ScriptService, {
    listScripts: () => ({
      scripts: [{ id: "script-1", name: "Reconnect test" }],
    }),
  }),
);

function Shell() {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TransportContext value={transport}>
        <AboutContext value={{ openAbout: () => setAboutOpen(true) }}>
          <CreateInstanceContext value={{ openCreateInstance: createProject }}>
            <CommandPaletteProvider>
              <SidebarProvider>
                <Sidebar>
                  <SidebarContent>
                    <CommandPaletteTrigger />
                  </SidebarContent>
                </Sidebar>
                <SidebarInset>
                  <div className="flex flex-col gap-4 p-6">
                    <h1>Command menu test</h1>
                    <Input aria-label="Editor" placeholder="Type here" />
                    <Button onClick={() => setAboutOpen(true)}>
                      Open another dialog
                    </Button>
                    <Outlet />
                  </div>
                </SidebarInset>
              </SidebarProvider>
            </CommandPaletteProvider>
          </CreateInstanceContext>
          <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
            <DialogContent>
              <DialogTitle>About SoulFire</DialogTitle>
              <DialogDescription>
                Another dialog for testing focus and shortcuts.
              </DialogDescription>
            </DialogContent>
          </Dialog>
        </AboutContext>
      </TransportContext>
    </ThemeProvider>
  );
}

function Example({ queryFailure = false }: { queryFailure?: boolean }) {
  const [setup] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    let attempts = 0;
    const instanceListQueryOptions = queryOptions({
      queryKey: ["instance-list"],
      queryFn: async () => {
        loadProjects();
        if (queryFailure && attempts++ === 0)
          throw new Error("Projects unavailable");
        return projectData;
      },
    });
    const clientDataQueryOptions = queryOptions({
      queryKey: ["client-data"],
      queryFn: async () =>
        create(ClientDataResponseSchema, {
          id: "palette-story",
          serverPermissions: [
            {
              globalPermission: GlobalPermission.CREATE_INSTANCE,
              granted: true,
            },
          ],
        }),
    });
    const instanceInfoQueryOptions = queryOptions({
      queryKey: ["instance-info", "farm"],
      queryFn: async () => current,
    });
    const root = createRootRoute();
    const dashboard = createRoute({
      getParentRoute: () => root,
      id: "_dashboard",
      beforeLoad: () => ({ clientDataQueryOptions, instanceListQueryOptions }),
      component: Shell,
    });
    const user = createRoute({
      getParentRoute: () => dashboard,
      path: "/user",
      component: () => <p>Projects page</p>,
    });
    const instance = createRoute({
      getParentRoute: () => dashboard,
      path: "/instance/$instance",
      beforeLoad: () => ({ instanceInfoQueryOptions }),
      component: Outlet,
    });
    const overview = createRoute({
      getParentRoute: () => instance,
      path: "/",
      component: () => <p>Project overview</p>,
    });
    const terminal = createRoute({
      getParentRoute: () => instance,
      path: "/terminal",
      component: () => <p>Project terminal page</p>,
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/instance/farm"] }),
      routeTree: root.addChildren([
        dashboard.addChildren([
          user,
          instance.addChildren([overview, terminal]),
        ]),
      ]),
    });
    return { queryClient, router };
  });
  return (
    <QueryClientProvider client={setup.queryClient}>
      <RouterProvider router={setup.router as never} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Navigation/Command menu",
  component: Example,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    loadProjects.mockClear();
    createProject.mockClear();
    const key = `sf-palette-recents:${JSON.stringify([localStorage.getItem("server-address"), "palette-story"])}`;
    localStorage.removeItem(key);
    return () => localStorage.removeItem(key);
  },
} satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SearchAndNavigate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    await canvas.findByText("Project overview");
    await expect(loadProjects).not.toHaveBeenCalled();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await page.findByRole("dialog", { name: "Command menu" });
    const input = within(dialog).getByRole("combobox", {
      name: "Command menu",
    });
    await expect(input).toHaveFocus();
    await expect(await within(dialog).findByText("Test farm")).toBeVisible();
    await userEvent.type(input, "qqqqqq");
    await within(dialog).findByText("No matching results");
    await userEvent.clear(input);
    await userEvent.type(input, "farm");
    await within(dialog).findByRole("option", { name: /Terminal.*Test farm/ });
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      within(dialog).getByRole("option", { name: /Terminal.*Test farm/ }),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "farm console");
    await within(dialog).findByRole("option", { name: /Terminal.*Test farm/ });
    await userEvent.keyboard("{Enter}");
    await canvas.findByText("Project terminal page");
    await userEvent.click(
      canvas.getByRole("button", { name: /Search and commands/ }),
    );
    const reopened = await page.findByRole("dialog", { name: "Command menu" });
    const recentGroup = within(reopened).getByRole("group", {
      name: "Recent destinations",
    });
    await waitFor(() =>
      expect(
        within(recentGroup).getByRole("option", {
          name: /Terminal.*Test farm/,
        }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(reopened).getByRole("option", { name: "Projects" }),
    );
    await canvas.findByText("Projects page");
    await userEvent.keyboard("{Control>}k{/Control}");
    const globalDialog = await page.findByRole("dialog", {
      name: "Command menu",
    });
    await expect(
      within(globalDialog).queryByRole("group", { name: "Current project" }),
    ).not.toBeInTheDocument();
    await within(globalDialog).findByRole("option", { name: "Use dark theme" });
  },
};

export const ShortcutsAndActions: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    const trigger = await canvas.findByRole("button", {
      name: /Search and commands/,
    });
    await userEvent.click(trigger);
    let dialog = await page.findByRole("dialog", { name: "Command menu" });
    await userEvent.type(within(dialog).getByRole("combobox"), "dark theme");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    await userEvent.click(
      canvas.getByRole("heading", { name: "Command menu test" }),
    );
    await userEvent.keyboard("{Shift}{Shift}");
    dialog = await page.findByRole("dialog", { name: "Command menu" });
    await userEvent.type(
      within(dialog).getByRole("combobox"),
      "create project",
    );
    await userEvent.keyboard("{Enter}");
    await expect(createProject).toHaveBeenCalledOnce();
    const editor = canvas.getByRole("textbox", { name: "Editor" });
    await userEvent.click(editor);
    await userEvent.keyboard("{Shift}{Shift}");
    await waitFor(() =>
      expect(
        page.queryByRole("combobox", { name: "Command menu" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    await page.findByRole("dialog", { name: "Command menu" });
    await userEvent.keyboard("{Control>}k{/Control}");
    await waitFor(() => expect(editor).toHaveFocus());
    await userEvent.keyboard("{Control>}k{/Control}");
    await page.findByRole("dialog", { name: "Command menu" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(editor).toHaveFocus());
    await userEvent.keyboard("{Control>}k{/Control}");
    dialog = await page.findByRole("dialog", { name: "Command menu" });
    await userEvent.type(within(dialog).getByRole("combobox"), "about");
    await userEvent.keyboard("{Enter}");
    const about = await page.findByRole("dialog", { name: "About SoulFire" });
    await waitFor(() =>
      expect(about.contains(document.activeElement)).toBe(true),
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    await waitFor(() =>
      expect(
        page.queryByRole("combobox", { name: "Command menu" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{Escape}");
  },
};

export const QueryFailureAndRetry: Story = {
  args: { queryFailure: true },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: /Search and commands/ }),
    );
    const dialog = await page.findByRole("dialog", { name: "Command menu" });
    await within(dialog).findByText("Some results could not load.");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("option", { name: "Use dark theme" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Retry" }),
    );
    await within(dialog).findByRole("option", { name: /Terminal.*Test farm/ });
    await expect(
      within(dialog).queryByText("Some results could not load."),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};
