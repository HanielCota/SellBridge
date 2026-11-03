import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@/components/brand/brand-logo";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { SessionUser } from "@/features/auth/session.functions";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { accountLabel } from "@/features/auth/account-label";
import { UserAvatar } from "./user-avatar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { SupportButton } from "./support-button";
import { UserMenu } from "./user-menu";
import { TeamModeButton } from "./team-mode-entry";
import type { AppNavigationState } from "./use-app-navigation";

function AccountChip({
  user,
  supportReplies,
  adminMode,
  profileKind,
}: {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
  profileKind: ProfileKind;
}) {
  return (
    <UserMenu
      user={user}
      supportReplies={supportReplies}
      adminMode={adminMode}
      profileKind={profileKind}
      className="rounded-full bg-card p-1.5"
    >
      <span className="relative shrink-0">
        <UserAvatar name={user.name} image={user.image} />
        {/* Where the name hides (phones), the shield still says the team mode is on. */}
        {adminMode ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-primary-foreground ring-2 ring-card sm:hidden"
          >
            <ShieldCheckIcon className="size-3" weight="bold" />
          </span>
        ) : null}
      </span>
      <span className="hidden min-w-0 leading-tight sm:block">
        <span className="block max-w-40 truncate text-base font-medium">{user.name}</span>
        {adminMode ? (
          <span className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-brand-text">
            <span className="size-1.5 rounded-full bg-brand-mark" aria-hidden="true" />
            {teamModeActiveTag(user.role)}
          </span>
        ) : (
          <span className="block text-sm text-muted-foreground">
            {accountLabel(user.role, profileKind)}
          </span>
        )}
      </span>
    </UserMenu>
  );
}

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

/** The header's right side: search, support, the team's way in, the bell and the account. */
function HeaderActions({
  user,
  adminMode,
  profileKind,
  supportReplies,
  teamModeRole,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  supportReplies: number;
  teamModeRole: string | null;
}) {
  const isSupplier = profileKind === "supplier";
  return (
    <div className="ml-auto flex items-center gap-2">
      {/* The search looks through the seller's orders, listings and stores. */}
      {isSupplier ? null : <CommandPalette />}
      {/* In admin mode the team is answering tickets; their own support stays in the menu. */}
      {adminMode ? null : (
        <div className="hidden sm:block">
          <SupportButton unread={supportReplies} profileKind={profileKind} />
        </div>
      )}
      {/* On phones the way in is the first row of the menu sheet: the header has no room. */}
      {teamModeRole === null ? null : (
        <div className="hidden sm:block">
          <TeamModeButton role={teamModeRole} />
        </div>
      )}
      <NotificationBell />
      <AccountChip
        user={user}
        supportReplies={supportReplies}
        adminMode={adminMode}
        profileKind={profileKind}
      />
    </div>
  );
}

interface TopNavProps {
  readonly user: SessionUser;
  readonly adminMode: boolean;
  readonly profileKind: ProfileKind;
  readonly state: AppNavigationState;
}

/**
 * App header over the page: the menu button and logo below `lg` (the sidebar holds both from
 * there), then search, support, the bell and the account.
 */
export function TopNav({ user, adminMode, profileKind, state }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-4 md:px-8">
        <MobileNav
          navigation={state.navigation}
          profileKind={profileKind}
          pathname={state.pathname}
          counts={state.counts}
          teamModeRole={state.teamModeRole}
        />
        <HomeLink isSupplier={profileKind === "supplier"} />
        <HeaderActions
          user={user}
          adminMode={adminMode}
          profileKind={profileKind}
          supportReplies={state.counts.supportReplies}
          teamModeRole={state.teamModeRole}
        />
      </div>
    </header>
  );
}
