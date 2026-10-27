import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission, isStaffRole } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import { TrackPill } from "@/components/data/track-pill";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { AccountProfile, SessionUser } from "@/features/auth/session.functions";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import { reviewQueueCountQueryOptions } from "@/features/admin-product-review/review.queries";
import {
  activeNavItemTo,
  ADMIN_NAV_ITEMS,
  NAV_ITEMS,
  type NavItem,
} from "@/features/navigation/nav-items";
import { staffShipmentCountsQueryOptions } from "@/features/admin-shipments/shipments.queries";
import {
  adminProfileSections,
  isCurrentSection,
  type ProfileSection,
} from "@/features/navigation/profile-sections";
import { myUnreadConversationsQueryOptions } from "@/features/supplier-support/supplier-support.queries";
import { UserAvatar } from "./user-avatar";
import { chooseOnPlainClick } from "./nav-tab-parts";
import { NavTab, TeamDivider, type BadgeCounts } from "./nav-tab";
import { MobileNav, type MobileNavigation } from "./mobile-nav";
import { ProfileTabsMenu } from "./profile-tabs-menu";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { SupportButton } from "./support-button";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { accountLabel } from "@/features/auth/account-label";
import { UserMenu } from "./user-menu";
import { TeamModeButton } from "./team-mode-entry";

/**
 * Reserve the side controls before allocating space to the navigation capsule. Admin mode
 * uses denser tabs and an account badge. Both layouts move navigation into the menu below xl;
 * regular account names stay compact until 1440px. Full class strings, so Tailwind sees them.
 */
const LAYOUTS = {
  regular: {
    // Reserve the actual account width: equal side tracks overlap the logo with long names.
    row: "xl:grid-cols-[auto_minmax(0,1fr)_auto]",
    desktopNav: "min-w-0 max-w-full overflow-x-auto justify-self-center xl:flex",
    sheetTrigger: "xl:hidden",
    // Slightly tighter than the sheet's tabs: at full size the capsule pressed against the logo,
    // and with icons and px-3 the seven tabs overflowed the 1440px row and clipped Financeiro.
    tab: "px-2.5 text-[0.9375rem] gap-1",
    // Account names stay visible on desktop; their text is capped until the row has more room.
    accountName: "hidden sm:block lg:hidden xl:block",
    // Beside the account name the capsule only fits the tab icons from 1440px (touched the logo at 1400).
    tabIcon: "hidden size-4 min-[1440px]:block",
    modeBadge: "hidden",
  },
  dense: {
    row: "xl:grid-cols-[auto_minmax(0,1fr)_auto]",
    desktopNav: "min-w-0 max-w-full overflow-x-auto justify-self-center xl:flex",
    sheetTrigger: "xl:hidden",
    // Below 1440px the ten tabs and the team divider clipped "Equipe" (admin section 0).
    tab: "px-1.5 min-[1440px]:px-2",
    // The row stops growing at 1440px, so with ten tabs the name never fits: it pushed the
    // capsule over the logo from 2xl up. It stays readable to screen readers; a badge shows the mode.
    accountName: "sr-only",
    // Twelve tabs plus the Revendedor and Fornecedor menus fill the capsule even at 1440px, so
    // the icons stay in the phone sheet and the menus (admin profile menus, approved mockup).
    tabIcon: "hidden",
    modeBadge: "flex",
  },
} as const;

type Layout = (typeof LAYOUTS)[keyof typeof LAYOUTS];

function layoutFor(adminMode: boolean): Layout {
  return adminMode ? LAYOUTS.dense : LAYOUTS.regular;
}

/** `canReview`: only role admin reviews supplier products (the queue's server functions check it). */
function useNavCounts({
  isAdmin,
  canReview,
  canSeeShipments,
  isSupplier,
}: {
  isAdmin: boolean;
  canReview: boolean;
  canSeeShipments: boolean;
  isSupplier: boolean;
}) {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  const productReviews = useQuery({ ...reviewQueueCountQueryOptions(), enabled: canReview });
  const storeMessages = useQuery({ ...myUnreadConversationsQueryOptions(), enabled: isSupplier });
  const shipments = useQuery({ ...staffShipmentCountsQueryOptions(), enabled: canSeeShipments });
  return {
    counts: {
      failedListings: attention.data?.failedListings ?? 0,
      openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
      parcelAlerts: attention.data?.parcelAlerts ?? 0,
      productReviews: canReview ? (productReviews.data ?? 0) : 0,
      staffParcelAlerts: canSeeShipments
        ? (shipments.data?.late ?? 0) + (shipments.data?.problem ?? 0)
        : 0,
      storeMessages: isSupplier ? (storeMessages.data ?? 0) : 0,
      supportReplies: attention.data?.unreadSupportReplies ?? 0,
      supplierOrders: attention.data?.supplierOrders ?? 0,
    } satisfies BadgeCounts,
  };
}

/** The lit pill under the chosen tab; a tab registers under every page it stands for. */
function useTabPill(activeTo: NavItem["to"] | null) {
  const chosen = useOptimisticChoice(activeTo);
  const containerRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string | null, HTMLElement>());
  const indicator = useActiveIndicator(chosen.value, containerRef, tabRefs);
  const canAnimate = useAnimateAfterFirstPaint(indicator !== null);
  // The profile menu's tab registers for each of its pages, so the pill lands on it.
  const registerTab = (targets: readonly NavItem[], node: HTMLElement | null) => {
    for (const target of targets) {
      if (!node) {
        tabRefs.current.delete(target.to);
        continue;
      }
      tabRefs.current.set(target.to, node);
    }
  };
  return { chosen, containerRef, indicator, canAnimate, registerTab };
}

/**
 * The tab capsule. One lit pill glides to the page you pick, like the period and status
 * controls; it moves on the click, while the next page still loads.
 */
function DesktopNav({
  items,
  profileSections,
  pathname,
  counts,
  layout,
}: {
  items: readonly NavItem[];
  /** Team mode folds each profile's tabs into a menu tab ahead of the team's. */
  profileSections: readonly ProfileSection[];
  pathname: string;
  counts: BadgeCounts;
  layout: Layout;
}) {
  const currentItems = profileSections.find(isCurrentSection)?.items ?? [];
  const allItems = [...currentItems, ...items];
  const activeTo = activeNavItemTo(allItems, pathname);
  const { chosen, containerRef, indicator, canAnimate, registerTab } = useTabPill(activeTo);
  return (
    <nav
      ref={containerRef}
      aria-label="Principal"
      className={cn(
        "relative hidden items-center gap-0.5 rounded-full bg-card p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        layout.desktopNav,
      )}
    >
      {indicator && chosen.value !== null ? (
        <TrackPill box={indicator} canAnimate={canAnimate} className="inset-y-1.5" />
      ) : null}
      {profileSections.map((section) => (
        <ProfileTabsMenu
          key={section.kind}
          section={section}
          activeTo={chosen.value}
          counts={counts}
          paintsOwnPill={indicator === null}
          padding={layout.tab}
          // Only the tab's own profile can hold the pill: the other menu leaves for its profile.
          triggerRef={(node) => registerTab(isCurrentSection(section) ? section.items : [], node)}
          onChoose={chosen.choose}
        />
      ))}
      {/* Where the team tabs begin (admin section 0 of the icons plan). */}
      {profileSections.length > 0 && items.length > 0 ? <TeamDivider vertical /> : null}
      {items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={item.to === chosen.value}
          count={item.badge ? counts[item.badge] : 0}
          paintsOwnPill={indicator === null}
          padding={layout.tab}
          withHint
          iconClassName={layout.tabIcon}
          tabRef={(node) => registerTab([item], node)}
          onNavigate={(event) => chooseOnPlainClick(event, () => chosen.choose(item.to))}
        />
      ))}
    </nav>
  );
}

/**
 * The header outlives every page, so after the pill first lands it should glide on any change:
 * a click, the command palette or the back button.
 */
function useAnimateAfterFirstPaint(hasLanded: boolean): boolean {
  const [canAnimate, setCanAnimate] = useState(false);
  useEffect(() => {
    if (!hasLanded) {
      return undefined;
    }
    // Flipped on the next frame, once the pill has been painted where it landed.
    const frame = requestAnimationFrame(() => setCanAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [hasLanded]);
  return canAnimate;
}

function AccountChip({
  user,
  supportReplies,
  adminMode,
  profileKind,
  layout,
}: {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
  profileKind: ProfileKind;
  layout: Layout;
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
        {adminMode ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-5 items-center justify-center rounded-full bg-brand text-primary-foreground ring-2 ring-card",
              layout.modeBadge,
            )}
          >
            <ShieldCheckIcon className="size-3" weight="bold" />
          </span>
        ) : null}
      </span>
      <span className={cn("min-w-0 leading-tight", layout.accountName)}>
        <span className="block max-w-40 truncate text-base font-medium xl:max-w-24 min-[1440px]:max-w-40">
          {user.name}
        </span>
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

interface TopNavProps {
  readonly user: SessionUser;
  readonly adminMode: boolean;
  readonly profileKind: ProfileKind;
  readonly profiles: readonly AccountProfile[];
}

interface HeaderNavigation {
  mobile: MobileNavigation;
  /** Plain tabs of the desktop capsule: the profile's, or in team mode the team's. */
  desktopItems: readonly NavItem[];
  /** Team mode only: each profile the admin can open, as a menu tab of the capsule. */
  profileSections: readonly ProfileSection[];
}

/** Tabs for the phone sheet and the desktop capsule; team mode splits them by profile. */
function navigationFor(
  user: SessionUser,
  adminMode: boolean,
  profileKind: ProfileKind,
  profiles: readonly AccountProfile[],
): HeaderNavigation {
  const sections = adminProfileSections(profileKind, profiles);
  const profileItems = sections.find(isCurrentSection)?.items ?? NAV_ITEMS;
  if (!adminMode) {
    return {
      mobile: { profileItems, profileSections: [], teamItems: [] },
      desktopItems: profileItems,
      profileSections: [],
    };
  }
  const teamItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.permission || hasStaffPermission(user.role, item.permission),
  );
  return {
    mobile: { profileItems, profileSections: sections, teamItems },
    desktopItems: teamItems,
    profileSections: sections,
  };
}

function HomeLink({ isSupplier }: { isSupplier: boolean }) {
  return (
    <Link
      to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
      aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
      className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
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
  layout,
}: {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  supportReplies: number;
  teamModeRole: string | null;
  layout: Layout;
}) {
  const isSupplier = profileKind === "supplier";
  return (
    <div className="flex items-center gap-2 justify-self-end">
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
        layout={layout}
      />
    </div>
  );
}

/** App header: logo, the pill navigation and the account chip, as one floating row. */
export function TopNav({ user, adminMode, profileKind, profiles }: TopNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isSupplier = profileKind === "supplier";
  const { counts } = useNavCounts({
    isAdmin: adminMode,
    canReview: adminMode && user.role === "admin",
    canSeeShipments: adminMode && hasStaffPermission(user.role, "shipments.view"),
    isSupplier,
  });
  const supportReplies = counts.supportReplies;
  const navigation = navigationFor(user, adminMode, profileKind, profiles);
  const layout = layoutFor(adminMode);
  const teamModeRole = isStaffRole(user.role) && !adminMode ? user.role : null;
  return (
    <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {/* Side columns reserve their content; the capsule uses the space between them. */}
      <div
        className={cn(
          "mx-auto grid max-w-[1440px] grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 md:px-8",
          layout.row,
        )}
      >
        <div className="flex items-center gap-3">
          <MobileNav
            navigation={navigation.mobile}
            profileKind={profileKind}
            pathname={pathname}
            counts={counts}
            triggerClassName={layout.sheetTrigger}
            teamModeRole={teamModeRole}
          />
          <HomeLink isSupplier={isSupplier} />
        </div>
        <DesktopNav
          items={navigation.desktopItems}
          profileSections={navigation.profileSections}
          pathname={pathname}
          counts={counts}
          layout={layout}
        />
        <HeaderActions
          user={user}
          adminMode={adminMode}
          profileKind={profileKind}
          supportReplies={supportReplies}
          teamModeRole={teamModeRole}
          layout={layout}
        />
      </div>
    </header>
  );
}
