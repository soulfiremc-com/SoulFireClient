import { getConnectionRetryDelay } from "@/lib/connection-errors";
import { startCastClient } from "@/lib/cast-client";
import {
  createBrowserHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorComponent } from "@/components/error-component.tsx";
import { LoadingComponent } from "@/components/loading-component.tsx";
import { NotFoundComponent } from "@/components/not-found-component.tsx";
import { synchronizeQuerySession } from "@/lib/query-session.ts";
import { parseUrlSearch, stringifyUrlSearch } from "@/lib/router-search.ts";
import { getServerType, isAuthenticated } from "@/lib/web-rpc.ts";
import { routeTree } from "./routeTree.gen";

// A new deployment removes old chunks, so a reload picks up the new build. A
// chunk that stays missing (blocked, or a stale cached page) must not reload
// the page forever, so reload at most once every 10 seconds.
window.addEventListener("vite:preloadError", () => {
  const key = "preload-error-reload";
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // Without storage, still recover from the usual stale-chunk case.
  }
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        getConnectionRetryDelay(error, failureCount) !== null,
      retryDelay: (failureCount, error) =>
        getConnectionRetryDelay(error, failureCount) ?? 0,
    },
  },
});

const stopCastClient = startCastClient();
import.meta.hot?.dispose(stopCastClient);
const stopQuerySessionSync = synchronizeQuerySession(queryClient);
import.meta.hot?.dispose(stopQuerySessionSync);

// noinspection JSUnusedGlobalSymbols
const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
  parseSearch: parseUrlSearch,
  stringifySearch: stringifyUrlSearch,
  defaultPreload: "intent",
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  scrollRestorationBehavior: "auto",
  defaultErrorComponent: ErrorComponent,
  defaultPendingComponent: LoadingComponent,
  defaultNotFoundComponent: NotFoundComponent,
  defaultStructuralSharing: true,
  context: { queryClient },
  Wrap: ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ),
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  // noinspection JSUnusedGlobalSymbols
  interface Register {
    router: typeof router;
  }
}

// A saved server opens the dashboard, unless the user asked for the
// connection settings. Render nothing while the browser leaves the page.
const opensSavedServer =
  isAuthenticated() &&
  getServerType() === "dedicated" &&
  window.location.pathname === "/" &&
  new URLSearchParams(window.location.search).get("configure") !== "true";
if (opensSavedServer) {
  window.location.replace(`/user${window.location.search}`);
}

// Render the app
const rootElement = document.querySelector("#root");
if (rootElement && !opensSavedServer) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
