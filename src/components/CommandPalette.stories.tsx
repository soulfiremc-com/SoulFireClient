import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createRouterTransport } from "@connectrpc/connect";
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
  useSearch,
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
import { InstanceSettingsPageComponent } from "@/components/settings-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  BotDesiredState,
  BotRuntimeState,
  BotService,
} from "@/generated/soulfire/bot_pb";
import { ClientDataResponseSchema } from "@/generated/soulfire/client_pb";
import {
  GlobalPermission,
  InstancePermission,
  SettingsDefinitionSchema,
  SettingsPageSchema,
} from "@/generated/soulfire/common_pb";
import {
  InstanceInfoSchema,
  InstanceListResponseSchema,
  InstanceService,
} from "@/generated/soulfire/instance_pb";
import { ScriptService } from "@/generated/soulfire/script_pb";
import { palettePinKey } from "@/lib/command-palette-pins";
import { fetchInstanceInfo } from "@/lib/instance-info-query";
import { parseSettingFocusSearch } from "@/lib/settings-focus";
import type { InstanceInfoQueryData } from "@/lib/types";

const createProject = fn();
const loadProjects = fn();
const loadProjectInfo = fn();
const loadBots = fn();
const setDesiredState = fn();
const restartBots = fn();
const deactivateScript = fn();
let activeQueryClient: QueryClient | undefined;
const focusPage = create(SettingsPageSchema, {
  id: "bot",
  pageName: "Bot settings",
  entries: [{ namespace: "bot", key: "read-timeout" }],
});
const focusDefinition = create(SettingsDefinitionSchema, {
  id: { namespace: "bot", key: "read-timeout" },
  type: {
    case: "int",
    value: { uiName: "Read Timeout", def: 30, min: 0, max: 120, step: 1 },
  },
});
const grant = (permissions: InstancePermission[]) =>
  permissions.map((instancePermission) => ({
    instancePermission,
    granted: true,
  }));
const permissions = [
  InstancePermission.READ_INSTANCE,
  InstancePermission.READ_BOT_INFO,
  InstancePermission.INSTANCE_SUBSCRIBE_LOGS,
];
const minePermissions = grant([
  InstancePermission.READ_INSTANCE,
  InstancePermission.READ_BOT_INFO,
  InstancePermission.CONTROL_BOTS,
  InstancePermission.EXECUTE_SCRIPTS,
]);
const projectData = create(InstanceListResponseSchema, {
  instances: [
    {
      id: "farm",
      friendlyName: "Test farm",
      instancePermissions: grant(permissions),
    },
    {
      id: "mine",
      friendlyName: "Mine site",
      icon: "pickaxe",
      instancePermissions: minePermissions,
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
const mineBots = [
  ["a", "Alpha"],
  ["b", "Beta"],
  ["c", "Gamma"],
  ["d", "Delta"],
] as const;
const running = {
  desiredState: BotDesiredState.RUNNING,
  runtimeState: BotRuntimeState.RUNNING,
};

function createStoryTransport({
  projectFailure = false,
  operationFailure = false,
}: {
  projectFailure?: boolean;
  operationFailure?: boolean;
}) {
  let projectAttempts = 0;
  return createRouterTransport((router) => {
    router.service(ScriptService, {
      listScripts: (request) => ({
        scripts:
          request.instanceId === "mine"
            ? [{ id: "auto", name: "Auto mine", paused: false }]
            : [{ id: "script-1", name: "Reconnect test" }],
      }),
      deactivateScript: (request) => {
        deactivateScript({
          instanceId: request.instanceId,
          scriptId: request.scriptId,
        });
        return {};
      },
    });
    router.service(InstanceService, {
      getInstanceInfo: (request) => {
        loadProjectInfo(request.id);
        if (projectFailure && projectAttempts++ === 0)
          throw new ConnectError("Project unavailable", Code.Unavailable);
        return {
          result: {
            case: "info",
            value: {
              friendlyName: "Mine site",
              icon: "pickaxe",
              instancePermissions: minePermissions,
              instanceSettings: [focusPage],
              settingsDefinitions: [focusDefinition],
              config: {
                accounts: mineBots.map(([profileId, lastKnownName]) => ({
                  profileId,
                  lastKnownName,
                  accountData: { case: "offlineJavaData", value: {} },
                })),
              },
            },
          },
        };
      },
    });
    router.service(BotService, {
      getBotList: (request) => {
        loadBots(request.instanceId);
        return {
          bots:
            request.instanceId === "mine"
              ? [
                  { profileId: "a", isOnline: true, status: running },
                  { profileId: "b", isOnline: true, status: running },
                  {
                    profileId: "c",
                    status: {
                      desiredState: BotDesiredState.RUNNING,
                      runtimeState: BotRuntimeState.FAILED,
                    },
                  },
                ]
              : [],
        };
      },
      setBotsDesiredState: (request) => {
        setDesiredState({
          instanceId: request.instanceId,
          botIds: request.botIds,
          desiredState: request.desiredState,
        });
        if (operationFailure)
          throw new ConnectError("Bot control failed", Code.Internal);
        return {
          bots: request.botIds.map((profileId) => ({ profileId })),
        };
      },
      restartBots: (request) => {
        restartBots({ instanceId: request.instanceId, botIds: request.botIds });
        return {
          bots: request.botIds.map((profileId) => ({ profileId })),
        };
      },
    });
  });
}
type StoryTransport = ReturnType<typeof createStoryTransport>;

function Shell({ transport }: { transport: StoryTransport }) {
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
              <DialogTitle>About Soulfire</DialogTitle>
              <DialogDescription>
                Another dialog for testing focus and shortcuts.
              </DialogDescription>
            </DialogContent>
          </Dialog>
          <Toaster />
        </AboutContext>
      </TransportContext>
    </ThemeProvider>
  );
}

function Example({
  queryFailure = false,
  projectFailure = false,
  operationFailure = false,
  manyProjects = false,
}: {
  queryFailure?: boolean;
  projectFailure?: boolean;
  operationFailure?: boolean;
  manyProjects?: boolean;
}) {
  const [setup] = useState(() => {
    const transport = createStoryTransport({
      projectFailure,
      operationFailure,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    activeQueryClient = queryClient;
    let attempts = 0;
    const instanceListQueryOptions = queryOptions({
      queryKey: ["instance-list"],
      queryFn: async () => {
        loadProjects();
        if (queryFailure && attempts++ === 0)
          throw new Error("Projects unavailable");
        return manyProjects
          ? create(InstanceListResponseSchema, {
              instances: [
                ...projectData.instances,
                ...Array.from({ length: 20 }, (_, id) => ({
                  id: `extra-${id}`,
                  friendlyName: `Extra project ${id}`,
                  instancePermissions: grant([
                    InstancePermission.READ_INSTANCE,
                  ]),
                })),
              ],
            })
          : projectData;
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
    const instanceInfoQueryOptions = (id: string) =>
      queryOptions({
        queryKey: ["instance-info", id],
        queryFn: async ({ signal }) =>
          id === "farm"
            ? current
            : fetchInstanceInfo(transport, id, queryClient, signal),
      });
    const root = createRootRoute();
    const dashboard = createRoute({
      getParentRoute: () => root,
      id: "_dashboard",
      beforeLoad: () => ({ clientDataQueryOptions, instanceListQueryOptions }),
      component: () => <Shell transport={transport} />,
    });
    const user = createRoute({
      getParentRoute: () => dashboard,
      path: "/user",
      component: () => <p>Projects page</p>,
    });
    const instance = createRoute({
      getParentRoute: () => dashboard,
      path: "/instance/$instance",
      beforeLoad: ({ params }) => ({
        instanceInfoQueryOptions: instanceInfoQueryOptions(params.instance),
      }),
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
    const settings = createRoute({
      getParentRoute: () => instance,
      path: "/settings/$pageId",
      validateSearch: parseSettingFocusSearch,
      component: () => {
        const search = useSearch({
          from: "/_dashboard/instance/$instance/settings/$pageId",
        });
        return (
          <InstanceSettingsPageComponent
            data={focusPage}
            focusSetting={
              search.focusNamespace && search.focusKey
                ? { namespace: search.focusNamespace, key: search.focusKey }
                : undefined
            }
          />
        );
      },
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/instance/farm"] }),
      routeTree: root.addChildren([
        dashboard.addChildren([
          user,
          instance.addChildren([overview, terminal, settings]),
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
    activeQueryClient = undefined;
    for (const mock of [
      loadProjects,
      createProject,
      loadProjectInfo,
      loadBots,
      setDesiredState,
      restartBots,
      deactivateScript,
    ])
      mock.mockClear();
    const server = localStorage.getItem("server-address");
    const keys = [
      `sf-palette-recents:${JSON.stringify([server, "palette-story"])}`,
      palettePinKey(server, "palette-story"),
    ];
    const clear = () => keys.forEach((key) => localStorage.removeItem(key));
    clear();
    return clear;
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
    const about = await page.findByRole("dialog", { name: "About Soulfire" });
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

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

async function openMenu({ canvasElement, userEvent }: PlayContext) {
  await within(canvasElement).findByText("Project overview");
  await userEvent.keyboard("{Control>}k{/Control}");
  const dialog = await within(document.body).findByRole("dialog", {
    name: "Command menu",
  });
  const menu = within(dialog);
  const input = menu.getByRole("combobox", { name: "Command menu" });
  await waitFor(() => expect(input).toHaveFocus());
  return { dialog, menu, input };
}

async function browseMine(
  context: PlayContext,
  { menu, input }: Awaited<ReturnType<typeof openMenu>>,
) {
  await context.userEvent.click(
    await menu.findByRole("button", {
      name: "Browse another project, current: Test farm",
    }),
  );
  await waitFor(() => expect(input).toHaveFocus());
  await expect(input).toHaveAttribute("placeholder", "Search projects...");
  await context.userEvent.type(input, "mine");
  await context.userEvent.click(
    await menu.findByRole("option", { name: /Browse project.*Mine site/ }),
  );
  await menu.findByRole("button", {
    name: "Browse another project, current: Mine site",
  });
  await waitFor(() => expect(input).toHaveFocus());
}

const closed = () =>
  waitFor(() =>
    expect(
      within(document.body).queryByRole("combobox", { name: "Command menu" }),
    ).not.toBeInTheDocument(),
  );

export const BrowseProjectInPlace: Story = {
  play: async (context) => {
    const canvas = within(context.canvasElement);
    const { userEvent } = context;
    const opened = await openMenu(context);
    const { dialog, menu, input } = opened;
    // Other projects load nothing until the user chooses one.
    await expect(loadProjectInfo).not.toHaveBeenCalled();
    await expect(loadBots).not.toHaveBeenCalled();
    await browseMine(context, opened);
    await expect(input).toHaveAttribute(
      "placeholder",
      "Search in Mine site...",
    );
    await menu.findByRole("option", {
      name: /^Overview.*Mine site/,
      selected: true,
    });
    await menu.findByRole("option", { name: /Alpha.*Connected/ });
    await expect(
      menu.getByRole("option", { name: /Gamma.*Failed/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("option", { name: /Delta.*Stopped/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole("option", { name: /Auto mine.*Active/ }),
    ).toBeVisible();
    await expect(
      menu.queryByRole("option", { name: /Terminal/ }),
    ).not.toBeInTheDocument();
    await expect(loadProjectInfo).toHaveBeenCalledOnce();
    await expect(loadProjectInfo).toHaveBeenCalledWith("mine");
    await expect(loadBots).toHaveBeenCalledWith("mine");
    await expect(canvas.getByText("Project overview")).toBeVisible();

    await userEvent.type(input, "overview");
    await menu.findByRole("option", { name: /Overview.*Mine site/ });
    await userEvent.clear(input);
    // Backspace in an empty search returns to all results.
    await userEvent.keyboard("{Backspace}");
    await menu.findByRole("button", {
      name: "Browse another project, current: Test farm",
    });
    await menu.findByRole("option", { name: /Terminal.*Test farm/ });

    await browseMine(context, opened);
    await userEvent.keyboard("{Escape}");
    await menu.findByRole("button", {
      name: "Browse another project, current: Test farm",
    });
    await expect(dialog).toBeVisible();
    await browseMine(context, opened);
    await userEvent.click(
      menu.getByRole("button", { name: "Show all results" }),
    );
    await menu.findByRole("button", {
      name: "Browse another project, current: Test farm",
    });
    await userEvent.keyboard("{Escape}");
    await closed();
    // The project stayed cached, so browsing it again did not refetch.
    await expect(loadProjectInfo).toHaveBeenCalledOnce();
    await expect(canvas.getByText("Project overview")).toBeVisible();
  },
};

export const FiltersAndMatchHighlights: Story = {
  play: async (context) => {
    const { userEvent } = context;
    const { menu, input } = await openMenu(context);
    await userEvent.type(input, "console");
    const terminal = await menu.findByRole("option", {
      name: /Terminal.*Test farm.*Matches console/,
    });
    await expect(
      within(terminal).getByText("console", { selector: "mark" }),
    ).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "dark");
    const dark = await menu.findByRole("option", { name: "Use dark theme" });
    await expect(
      within(dark).getByText("dark", { selector: "mark" }),
    ).toBeVisible();
    await userEvent.clear(input);

    const filters = menu.getByRole("group", { name: "Result type" });
    await userEvent.click(
      within(filters).getByRole("button", { name: "Actions" }),
    );
    await waitFor(() => expect(input).toHaveFocus());
    await menu.findByRole("option", { name: "Use dark theme" });
    await expect(
      menu.queryByRole("option", { name: /Terminal/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(filters).getByRole("button", { name: "Scripts" }),
    );
    await menu.findByRole("option", { name: /Reconnect test/ });
    await expect(
      menu.queryByRole("option", { name: "Use dark theme" }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(filters).getByRole("button", { name: "All" }));
    await menu.findByRole("option", { name: /Terminal.*Test farm/ });
    await userEvent.keyboard("{Escape}");
    await closed();
  },
};

export const BulkOperationConfirmation: Story = {
  play: async (context) => {
    const { userEvent } = context;
    const page = within(document.body);
    const opened = await openMenu(context);
    const { menu, input } = opened;
    await browseMine(context, opened);
    await userEvent.type(input, "stop bots");
    await userEvent.click(
      await menu.findByRole("option", { name: /Stop 3 bots/ }),
    );
    let confirmation = await menu.findByRole("group", {
      name: "Stop 3 bots in Mine site?",
    });
    const cancel = within(confirmation).getByRole("button", {
      name: "Cancel",
    });
    await waitFor(() => expect(cancel).toHaveFocus());
    // Enter on the focused Cancel button must not run the selected result.
    await userEvent.keyboard("{Enter}");
    await menu.findByRole("option", { name: /Stop 3 bots/ });
    await expect(setDesiredState).not.toHaveBeenCalled();

    await userEvent.click(menu.getByRole("option", { name: /Stop 3 bots/ }));
    await menu.findByRole("group", { name: "Stop 3 bots in Mine site?" });
    await userEvent.keyboard("{Escape}");
    await menu.findByRole("option", { name: /Stop 3 bots/ });
    await expect(setDesiredState).not.toHaveBeenCalled();

    await userEvent.click(menu.getByRole("option", { name: /Stop 3 bots/ }));
    confirmation = await menu.findByRole("group", {
      name: "Stop 3 bots in Mine site?",
    });
    await userEvent.dblClick(
      within(confirmation).getByRole("button", { name: "Stop bots" }),
    );
    await closed();
    await page.findByText("Stop requested for 3 bots.");
    await expect(setDesiredState).toHaveBeenCalledOnce();
    await expect(setDesiredState).toHaveBeenCalledWith({
      instanceId: "mine",
      botIds: ["a", "b", "c"],
      desiredState: BotDesiredState.STOPPED,
    });
  },
};

export const PinnedCommandsAndSingleOperations: Story = {
  play: async (context) => {
    const { userEvent } = context;
    const page = within(document.body);
    let opened = await openMenu(context);
    await browseMine(context, opened);
    await userEvent.type(opened.input, "restart bot alpha");
    await opened.menu.findByRole("option", {
      name: /^Restart bot Alpha/,
      selected: true,
    });
    await userEvent.keyboard("{Enter}");
    await closed();
    await page.findByText("Restart requested for 1 bot.");
    await expect(restartBots).toHaveBeenCalledOnce();
    await expect(restartBots).toHaveBeenCalledWith({
      instanceId: "mine",
      botIds: ["a"],
    });

    opened = await openMenu(context);
    await browseMine(context, opened);
    await userEvent.type(opened.input, "deactivate");
    await opened.menu.findByRole("option", {
      name: /^Deactivate script Auto mine/,
      selected: true,
    });
    await userEvent.keyboard("{Control>}p{/Control}");
    await opened.menu.findByRole("button", {
      name: "Unpin Deactivate script Auto mine",
    });
    await userEvent.click(
      opened.menu.getByRole("button", { name: "Show all results" }),
    );
    await userEvent.type(opened.input, "dark theme");
    await opened.menu.findByRole("option", {
      name: "Use dark theme",
      selected: true,
    });
    await userEvent.click(
      opened.menu.getByRole("button", { name: "Pin Use dark theme" }),
    );
    await opened.menu.findByRole("button", {
      name: "Unpin Use dark theme",
    });
    await expect(opened.input).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await closed();

    const stored =
      localStorage.getItem(
        palettePinKey(localStorage.getItem("server-address"), "palette-story"),
      ) ?? "";
    await expect(JSON.parse(stored)).toEqual([
      { id: "deactivate-script:mine:auto", projectId: "mine" },
      { id: "theme-dark" },
    ]);

    // Project actions stay with their project and appear when it is in scope.
    opened = await openMenu(context);
    let pinned = within(
      await opened.menu.findByRole("group", { name: "Pinned" }),
    );
    await expect(
      pinned.getByRole("option", { name: "Use dark theme" }),
    ).toBeVisible();
    await expect(
      pinned.queryByRole("option", { name: /Deactivate script/ }),
    ).not.toBeInTheDocument();
    await browseMine(context, opened);
    await userEvent.clear(opened.input);
    pinned = within(await opened.menu.findByRole("group", { name: "Pinned" }));
    await userEvent.click(
      await pinned.findByRole("option", {
        name: /^Deactivate script Auto mine/,
      }),
    );
    await closed();
    await page.findByText("Script deactivated.");
    await expect(deactivateScript).toHaveBeenCalledOnce();
    await expect(deactivateScript).toHaveBeenCalledWith({
      instanceId: "mine",
      scriptId: "auto",
    });
  },
};

export const ProjectAndOperationErrors: Story = {
  args: { projectFailure: true, operationFailure: true },
  play: async (context) => {
    const { userEvent } = context;
    const page = within(document.body);
    const opened = await openMenu(context);
    const { menu, input } = opened;
    await browseMine(context, opened);
    await menu.findByText("Some results could not load.");
    await expect(
      menu.queryByRole("option", { name: /Alpha/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(menu.getByRole("button", { name: "Retry" }));
    await menu.findByRole("option", { name: /Alpha.*Connected/ });
    await expect(
      menu.queryByText("Some results could not load."),
    ).not.toBeInTheDocument();
    await userEvent.type(input, "stop bot alpha");
    await menu.findByRole("option", {
      name: /^Stop bot Alpha/,
      selected: true,
    });
    await userEvent.keyboard("{Enter}");
    await closed();
    await page.findByText("Could not request bot stop. Try again.");
    await expect(setDesiredState).toHaveBeenCalledOnce();
  },
};

export const ExactSettingKeepsFocus: Story = {
  play: async (context) => {
    const opened = await openMenu(context);
    await browseMine(context, opened);
    await context.userEvent.type(opened.input, "read timeout");
    const result = await opened.menu.findByRole("option", {
      name: /Read Timeout.*Bot settings/,
    });
    await context.userEvent.click(result);
    await waitFor(() =>
      expect(
        within(document.body).queryByRole("dialog", { name: "Command menu" }),
      ).not.toBeInTheDocument(),
    );
    const control = await within(context.canvasElement).findByRole("textbox", {
      name: "Read Timeout",
    });
    await waitFor(() => expect(control).toHaveFocus());
    await expect(
      within(context.canvasElement).getByRole("group", {
        name: "Read Timeout",
      }),
    ).toHaveAttribute("data-setting-focused", "true");
    await expect(setDesiredState).not.toHaveBeenCalled();
  },
};

export const PermissionRevokedDuringConfirmation: Story = {
  play: async (context) => {
    const opened = await openMenu(context);
    await browseMine(context, opened);
    await context.userEvent.type(opened.input, "stop bots");
    await context.userEvent.click(
      await opened.menu.findByRole("option", { name: /Stop 3 bots/ }),
    );
    const confirmation = await opened.menu.findByRole("group", {
      name: "Stop 3 bots in Mine site?",
    });
    activeQueryClient!.setQueryData<InstanceInfoQueryData>(
      ["instance-info", "mine"],
      (project) =>
        project
          ? {
              ...project,
              instancePermissions: project.instancePermissions.filter(
                (permission) =>
                  permission.instancePermission !==
                  InstancePermission.CONTROL_BOTS,
              ),
            }
          : project,
    );
    await within(confirmation).findByRole("alert");
    await expect(
      within(confirmation).getByRole("button", { name: "Stop bots" }),
    ).toBeDisabled();
    await context.userEvent.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    await expect(setDesiredState).not.toHaveBeenCalled();
    await context.userEvent.keyboard("{Escape}{Escape}");
    await closed();
  },
};

export const LargeCatalogIncludesPinsWithinLimit: Story = {
  args: { manyProjects: true },
  play: async (context) => {
    const server = localStorage.getItem("server-address");
    localStorage.setItem(
      palettePinKey(server, "palette-story"),
      JSON.stringify([
        { id: "terminal:farm", projectId: "farm" },
        { id: "theme-dark" },
      ]),
    );
    localStorage.setItem(
      `sf-palette-recents:${JSON.stringify([server, "palette-story"])}`,
      JSON.stringify(["projects", "user-settings"]),
    );
    const opened = await openMenu(context);
    await opened.menu.findByRole("group", { name: "Pinned" });
    await waitFor(() =>
      expect(opened.menu.getAllByRole("option")).toHaveLength(80),
    );
    await opened.menu.findByText(/\d+ more results\. Refine your search\./);
    await context.userEvent.keyboard("{Escape}");
    await closed();
  },
};
