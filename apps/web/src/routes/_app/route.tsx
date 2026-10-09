import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { TopNav } from "@/components/layout/top-nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { getAppSession } from "@/features/auth/session.functions";

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

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <div className="min-h-svh bg-background">
      {session.impersonatedBy ? <ImpersonationBanner customerName={session.user.name} /> : null}
      <TopNav user={session.user} adminMode={session.adminMode} />
      <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pt-2 pb-12 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
