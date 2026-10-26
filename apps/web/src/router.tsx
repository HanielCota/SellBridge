import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { DefaultCatchBoundary } from "@/components/feedback/default-catch-boundary";
import { NotFound } from "@/components/feedback/not-found";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // QueryClient owns freshness; re-run loaders so a stale preloaded query is refreshed.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: NotFound,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
