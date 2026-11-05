import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@/components/brand/brand-logo";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { SessionUser } from "@/features/auth/session.functions";
import { AccountChip } from "./account-chip";
import { AdminTabsBar } from "./admin-tabs-bar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { TeamModeButton } from "./team-mode-entry";
import type { AppNavigationState } from "./use-app-navigation";

/** The logo where the sidebar is closed away; from `lg` the sidebar shows it. */
function HomeLink({ isSupplier }: { isSupplier: boolean }) {
  return (
    <Link
      to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
      aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
      className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40 lg:hidden"
    >
      <BrandIcon className="size-10" />
    </Link>
  );
}

interface TopNavProps {
  readonly user: SessionUser;
  readonly adminMode: boolean;
  readonly profileKind: ProfileKind;
  readonly state: AppNavigationState;
}

/** The account's photo right of the bell from `lg`; on phones the account sits in the menu sheet. */
function HeaderAccount({ user, adminMode, profileKind, state }: TopNavProps) {
  return (
    <div className="hidden lg:block">
      <AccountChip
        user={user}
        supportReplies={state.counts.supportReplies}
        adminMode={adminMode}
        profileKind={profileKind}
        collapsed
        side="bottom"
      />
    </div>
  );
}

/**
 * App header over the page: the menu button and logo below `lg` (the sidebar holds both and
 * support from there), then search, the team's way in, the bell and the account. In team mode
 * the team's pages follow as a strip under it.
 */
export function TopNav({ user, adminMode, profileKind, state }: TopNavProps) {
  const isSupplier = profileKind === "supplier";
  const staffRole = isStaffRole(user.role) ? user.role : null;
  return (
    <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 md:px-8">
        <MobileNav
          navigation={state.navigation}
          user={user}
          adminMode={adminMode}
          profileKind={profileKind}
          pathname={state.pathname}
          counts={state.counts}
          teamModeRole={state.teamModeRole}
        />
        <HomeLink isSupplier={isSupplier} />
        <div className="ml-auto flex items-center gap-2">
          {/* The search looks through the seller's orders, listings and stores. */}
          {isSupplier ? null : <CommandPalette />}
          {/* On phones the way in is the first row of the menu sheet: the header has no room. */}
          {staffRole === null ? null : (
            <div className="hidden sm:block">
              <TeamModeButton role={staffRole} active={adminMode} />
            </div>
          )}
          <NotificationBell />
          <HeaderAccount
            user={user}
            adminMode={adminMode}
            profileKind={profileKind}
            state={state}
          />
        </div>
      </div>
      {adminMode ? (
        <div className="mx-auto hidden max-w-[1440px] px-4 pb-3 md:px-8 lg:block">
          <AdminTabsBar
            items={state.navigation.teamItems}
            pathname={state.pathname}
            counts={state.counts}
          />
        </div>
      ) : null}
    </header>
  );
}
