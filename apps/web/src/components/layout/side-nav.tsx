import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Link } from "@tanstack/react-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import { AccountNavList, NavList, ProfileSwitch, shownMenu } from "./nav-list";
import { SupportButton } from "./support-button";
import type { AppNavigationState } from "./use-app-navigation";

function SideNavHome({ isSupplier }: { isSupplier: boolean }) {
  return (
    <Link
      to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
      aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
      className="flex items-center gap-2.5 rounded-xl px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <BrandIcon className="size-9 shrink-0" />
      <span aria-hidden="true" className="text-lg font-semibold tracking-tight">
        SellBridge
      </span>
    </Link>
  );
}

/** The work items, then support and the account's pages pinned to the foot. */
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
      <div className="mt-auto border-t border-border pt-3">
        <AccountNavList {...list} supportPanel={supportPanel} />
      </div>
    </nav>
  );
}

/**
 * The desktop menu, fixed on the left from `lg`: the profile's pages in groups, with the
 * account's own pages at the foot. The team's pages and the account menu sit in the header.
 * Below `lg` the full list opens from the header's menu button.
 */
export function SideNav({
  state,
  profileKind,
}: {
  state: AppNavigationState;
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
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-4 border-r border-border bg-card px-4 py-5 lg:flex"
    >
      <SideNavHome isSupplier={profileKind === "supplier"} />
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
    </aside>
  );
}
