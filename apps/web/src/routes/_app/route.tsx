import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { TopNav } from "@/components/layout/top-nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { SETUP_STEPS, SetupStrip } from "@/components/onboarding/setup-guide";
import { getAppSession } from "@/features/auth/session.functions";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: AppLayout,
});

/** Pages that already guide the setup themselves, or are not about the reseller's store. */
const NO_SETUP_STRIP = ["/dashboard", "/onboarding", "/admin", "/perfil", "/suporte"];

function SetupReminder() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hidden = NO_SETUP_STRIP.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const query = useQuery({ ...setupProgressQueryOptions(), enabled: !hidden });
  if (hidden || !query.data) {
    return null;
  }
  const next = SETUP_STEPS.find((step) => !query.data[step.key]);
  // The page of the next step already explains it.
  if (next && pathname.startsWith(next.to)) {
    return null;
  }
  return <SetupStrip progress={query.data} />;
}

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <div className="min-h-svh bg-background">
      {session.impersonatedBy ? <ImpersonationBanner customerName={session.user.name} /> : null}
      <TopNav user={session.user} adminMode={session.adminMode} />
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pt-2 pb-12 md:px-8">
        <SetupReminder />
        <Outlet />
      </main>
    </div>
  );
}
