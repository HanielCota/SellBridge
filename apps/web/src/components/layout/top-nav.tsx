import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { SessionUser } from "@/features/auth/session.functions";
import { AccountSetupNotice } from "./account-setup-notice";
import { CommandPalette } from "./command-palette";
import { NewVersionNotice } from "./new-version-notice";
import { NotificationBell } from "./notification-bell";
import { ProfileCard } from "./profile-card";
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

/** Pages pin their own toolbars right under the header with `top: var(--app-header-height)`. */
const HEADER_HEIGHT_VARIABLE = "--app-header-height";

/**
 * Keeps the header's height in a CSS variable as it changes, on
 * the header's parent: the page sits in it too, and the value leaves with the layout.
 */
function usePublishedHeaderHeight(headerRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const header = headerRef.current;
    const holder = header?.parentElement;
    if (header === null || holder === null || holder === undefined) {
      return undefined;
    }
    const publish = () => {
      holder.style.setProperty(HEADER_HEIGHT_VARIABLE, `${header.offsetHeight}px`);
    };
    // Right away too: the observer reports only on the next frame, and until then a pinned
    // toolbar would stick at the very top, under the header.
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, [headerRef]);
}

interface TopNavProps {
  readonly user: SessionUser;
  readonly adminMode: boolean;
  readonly profileKind: ProfileKind;
  readonly state: AppNavigationState;
  readonly staffMobileMenu: ReactNode;
  readonly setupReminder?: ReactNode;
}

/**
 * App header over the page: the menu button and logo below `lg` (the sidebar holds both, support
 * and the account from there), then search, team mode, notifications and the staff avatar.
 */
export function TopNav({
  user,
  adminMode,
  profileKind,
  state,
  staffMobileMenu,
  setupReminder,
}: TopNavProps) {
  const isSupplier = profileKind === "supplier";
  const { teamOnly } = state.navigation;
  // A team member with no profile has nothing to switch to: the mode stays on.
  const staffRole = isStaffRole(user.role) && !teamOnly && !adminMode ? user.role : null;
  const headerRef = useRef<HTMLElement>(null);
  usePublishedHeaderHeight(headerRef);
  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 bg-background pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 pt-4 pb-2 md:px-8">
        {staffMobileMenu}
        <HomeLink isSupplier={isSupplier} />
        {setupReminder ? <div className="staff-header-setup">{setupReminder}</div> : null}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <NewVersionNotice />
          {/* A team member with no profile has no account to set up. */}
          <AccountSetupNotice enabled={!teamOnly} pathname={state.pathname} />
          {/* On phones the way in is the first row of the menu sheet: the header has no room. */}
          {staffRole === null ? null : (
            <div className="hidden sm:block">
              <TeamModeButton role={staffRole} active={adminMode} />
            </div>
          )}
          <div className="staff-header-controls">
            {isSupplier || teamOnly ? null : <CommandPalette iconOnly />}
            {teamOnly ? null : (
              <NotificationBell title={isStaffRole(user.role) ? "Notificações" : "Avisos"} />
            )}
            <ProfileCard user={user} adminMode={adminMode} profileKind={profileKind} />
          </div>
        </div>
      </div>
    </header>
  );
}
