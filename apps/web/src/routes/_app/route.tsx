import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand/brand-logo";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
    <SidebarProvider>
      <AppSidebar user={session.user} />
      <SidebarInset>
        {session.impersonatedBy ? <ImpersonationBanner customerName={session.user.name} /> : null}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:hidden">
          <SidebarTrigger aria-label="Abrir menu" />
          <BrandLogo className="text-base" iconClassName="size-6" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 md:px-8 md:py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
