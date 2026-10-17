import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { TopNav } from "@/components/layout/top-nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { SupportChat } from "@/components/support/support-chat";
import { attentionCountsQueryOptions } from "@/features/navigation/navigation.queries";
import { SetupStrip } from "@/components/onboarding/setup-guide";
import { profileRedirectFor } from "@/features/auth/profile-routes";
import { getAppSession } from "@/features/auth/session.functions";
import { findNextStep } from "@/features/onboarding/setup-progress";
import { needsTermsAcceptance } from "@/features/onboarding/terms-gate";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // Item 26.a (L4): the Google sign-up and a new version of the terms land here too.
    if (needsTermsAcceptance(session)) {
      throw redirect({ to: "/aceitar-termos", search: { redirect: location.href } });
    }
    const profileHome = profileRedirectFor(session.profileKind, location.pathname);
    if (profileHome !== null) {
      throw redirect({ to: profileHome });
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
  const next = findNextStep(query.data);
  // The page of the next step already explains it.
  if (next && pathname.startsWith(next.to)) {
    return null;
  }
  return <SetupStrip progress={query.data} />;
}

/** In admin mode the team is answering tickets, so the reseller chat stays out of the way. */
function SupportChatLauncher({ adminMode }: { adminMode: boolean }) {
  const attention = useQuery({ ...attentionCountsQueryOptions(), enabled: !adminMode });
  if (adminMode) {
    return null;
  }
  return <SupportChat unread={attention.data?.unreadSupportReplies ?? 0} />;
}

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <div className="min-h-svh bg-background">
      {session.impersonatedBy ? (
        <ImpersonationBanner
          customerName={session.user.name}
          endsAt={session.impersonationEndsAt}
        />
      ) : null}
      <TopNav user={session.user} adminMode={session.adminMode} profileKind={session.profileKind} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1440px] space-y-6 px-4 pt-4 pb-12 md:px-8 md:pt-8"
      >
        {session.profileKind === "seller" ? <SetupReminder /> : null}
        <Outlet />
      </main>
      <SupportChatLauncher adminMode={session.adminMode} />
    </div>
  );
}
