import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  retainSearchParams,
  useRouterState,
} from "@tanstack/react-router";
import { TopNav } from "@/components/layout/top-nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { SetupStrip } from "@/components/onboarding/setup-guide";
import { planProfileNavigation } from "@/features/auth/profile-navigation";
import { profileRedirectFor } from "@/features/auth/profile-routes";
import { getAppSession } from "@/features/auth/session.functions";
import { profileSlugSchema } from "@/lib/profile-param";
import {
  addProfileToHref,
  forgetTabProfile,
  rememberTabProfile,
  removeProfileFromHref,
  tabProfile,
} from "@/lib/tab-profile";
import { findNextStep } from "@/features/onboarding/setup-progress";
import { needsTermsAcceptance } from "@/features/onboarding/terms-gate";
import { setupProgressQueryOptions } from "@/features/reports/reports.queries";

/** Every page of the app carries its profile, so each tab keeps its own (see profile-param.ts). */
function validateAppSearch(search: Record<string, unknown>): { perfil?: string } {
  const parsed = profileSlugSchema.safeParse(search.perfil);
  // A malformed profile is never taken as the tab's; the server still refuses it by name.
  return parsed.success ? { perfil: parsed.data } : {};
}

function isTeamPage(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export const Route = createFileRoute("/_app")({
  validateSearch: validateAppSearch,
  search: { middlewares: [retainSearchParams(["perfil"])] },
  beforeLoad: async ({ location, search, preload, context }) => {
    const previousProfile = tabProfile();
    // Recorded before any call, so this navigation's calls already carry the new profile; a
    // preload (hovering a link) must not move the profile of the page still on screen.
    if (!preload && search.perfil !== undefined) {
      rememberTabProfile(search.perfil);
    }
    const session = await getAppSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    const plan = planProfileNavigation({
      searchProfile: search.perfil,
      sessionProfile: session.profileSlug,
      foreignProfile: session.foreignProfile,
      rememberedProfile: previousProfile,
      isTeamPage: isTeamPage(location.pathname),
    });
    if (plan.kind === "drop_profile") {
      forgetTabProfile();
      throw redirect({ href: removeProfileFromHref(location.href), replace: true });
    }
    if (plan.kind === "foreign_profile") {
      throw redirect({ to: "/outro-perfil", replace: true });
    }
    if (plan.kind === "add_profile") {
      throw redirect({ href: addProfileToHref(location.href, plan.slug), replace: true });
    }
    // Before the redirects below: the next navigation no longer sees the profile move.
    if (plan.clearCache && !preload) {
      context.queryClient.removeQueries();
    }
    // Item 26.a (L4): the Google sign-up and a new version of the terms land here too.
    if (needsTermsAcceptance(session)) {
      throw redirect({ to: "/aceitar-termos", search: { redirect: location.href } });
    }
    // The kind is the tab's profile: a supplier tab and a seller tab of one account each stay
    // on their own screens.
    const profileHome = profileRedirectFor(session.profileKind, location.pathname);
    if (profileHome !== null) {
      throw redirect({ href: addProfileToHref(profileHome, session.profileSlug) });
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
    </div>
  );
}
