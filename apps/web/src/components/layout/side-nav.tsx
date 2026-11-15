import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Link } from "@tanstack/react-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { SessionUser } from "@/features/auth/session.functions";
import { AccountNavList, NavList, ProfileSwitch, shownMenu } from "./nav-list";
import { ProfileCard } from "./profile-card";
import { SupportButton } from "./support-button";
import type { AppNavigationState } from "./use-app-navigation";

/** The logo and name; the sidebar and the phone sheet both open with it. */
export function SideNavHome({
  isSupplier,
  onNavigate,
}: {
  isSupplier: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Link
      to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
      aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <BrandIcon className="size-9 shrink-0" />
      <span aria-hidden="true" className="text-lg font-semibold tracking-tight">
        SellBridge
      </span>
    </Link>
  );
}

/** The work items, then support and the account's own page pinned to the foot. */
function SideNavLinks({
  list,
  supportPanel,
}: {
  list: ComponentProps<typeof NavList>;
  supportPanel: ReactNode;
}) {
  return (
    <nav
      aria-label="Principal"
      className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-1 [scrollbar-width:thin]"
    >
      <NavList {...list} />
      {/* No line here: the gap keeps the foot apart even when the list fills the column. */}
      <div className="mt-auto pt-6">
        <AccountNavList {...list} supportPanel={supportPanel} />
      </div>
    </nav>
  );
}

/**
 * The desktop menu, fixed on the left from `lg`: the logo over a thin line, the profile's pages
 * under soft group names, support and the plan at the foot, then a line and the profile card,
 * whose menu holds the profile, the registration, the team mode, the theme and signing out.
 * The team's pages sit in the header strip. Below `lg` the same list opens from the header.
 */
export function SideNav({
  state,
  user,
  adminMode,
  profileKind,
}: {
  state: AppNavigationState;
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
}) {
  const [shownKind, setShownKind] = useState<ProfileKind>(profileKind);
  const list = {
    navigation: state.navigation,
    shown: shownMenu(state.navigation, shownKind, state.pathname),
    counts: state.counts,
    withHint: true,
    // From `lg` the team's pages sit in the header strip (AdminTabsBar).
    withTeam: false,
  };
  return (
    <aside
      aria-label="Menu lateral"
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex"
    >
      <div className="border-b border-border px-4 py-4">
        <SideNavHome isSupplier={profileKind === "supplier"} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-3">
        <ProfileSwitch
          sections={state.navigation.profileSections}
          shownKind={shownKind}
          onChange={setShownKind}
        />
        <SideNavLinks
          list={list}
          supportPanel={
            <SupportButton unread={state.counts.supportReplies} profileKind={profileKind} />
          }
        />
      </div>
      <div className="border-t border-border p-2">
        <ProfileCard user={user} adminMode={adminMode} profileKind={profileKind} />
      </div>
    </aside>
  );
}
