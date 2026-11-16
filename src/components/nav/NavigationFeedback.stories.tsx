import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NavigationFeedback } from "@/components/nav/navigation-feedback.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar.tsx";

let releaseSlowPage: () => void = () => {};

function MobileSheetProbe() {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <Button variant="outline" onClick={() => setOpenMobile(true)}>
      {openMobile ? "Sheet open" : "Sheet closed"}
    </Button>
  );
}

function renderShell() {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider defaultOpen={false}>
        <SidebarInset>
          <NavigationFeedback />
          <nav className="flex gap-2 p-4">
            <MobileSheetProbe />
            <Link to="/">Home</Link>
            {/* The story router is not the registered app router. */}
            <Link to={"/slow" as never}>Slow page</Link>
          </nav>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <p>Home page</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/slow",
      loader: () =>
        new Promise<void>((resolve) => {
          releaseSlowPage = resolve;
        }),
      component: () => <p>Slow page content</p>,
    }),
  ]);
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree,
  });
  return <RouterProvider router={router as never} />;
}

const meta = {
  title: "Navigation/Navigation feedback",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingNavigation: Story = {
  render: () => renderShell(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Home page");
    await expect(canvas.queryByText("Loading page")).toBeNull();

    // A link in the open mobile sheet starts a navigation.
    await userEvent.click(canvas.getByRole("button", { name: "Sheet closed" }));
    await canvas.findByRole("button", { name: "Sheet open" });
    await userEvent.click(canvas.getByRole("link", { name: "Slow page" }));

    // The sheet closes and the loading status shows while the old page stays.
    await canvas.findByRole("button", { name: "Sheet closed" });
    await expect(await canvas.findByText("Loading page")).toBeInTheDocument();
    await expect(canvas.getByText("Home page")).toBeVisible();

    releaseSlowPage();
    await canvas.findByText("Slow page content");
    await waitFor(() => expect(canvas.queryByText("Loading page")).toBeNull());
  },
};

export const SamePageLinkClosesMobileSheet: Story = {
  render: () => renderShell(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Home page");
    await userEvent.click(canvas.getByRole("button", { name: "Sheet closed" }));
    await canvas.findByRole("button", { name: "Sheet open" });

    // Picking the page that is already open still dismisses the sheet.
    await userEvent.click(canvas.getByRole("link", { name: "Home" }));
    await canvas.findByRole("button", { name: "Sheet closed" });
  },
};
