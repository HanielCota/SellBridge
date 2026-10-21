import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { ACTION_ICONS, NAV_TAB_ICONS, type ActionIcon } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import { TrackPill } from "@/components/data/track-pill";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import type { SessionUser } from "@/features/auth/session.functions";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import { reviewQueueCountQueryOptions } from "@/features/admin-product-review/review.queries";
import {
  ADMIN_NAV_ITEMS,
  BADGE_DESCRIPTIONS,
  isActivePath,
  NAV_ITEMS,
  SUPPLIER_NAV_ITEMS,
  SUPPORT_NAV_ITEM,
  type NavBadge,
  type NavItem,
} from "@/features/navigation/nav-items";
import { UserAvatar } from "./user-avatar";
import { chooseOnPlainClick, navTabClassName, TabBadge } from "./nav-tab-parts";
import { ProfileTabsMenu } from "./profile-tabs-menu";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { SupportButton } from "./support-button";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { accountLabel } from "@/features/auth/account-label";
import { UserMenu } from "./user-menu";

type BadgeCounts = Record<NavBadge, number>;

interface ProfileGroup {
  label: string;
  items: readonly NavItem[];
}

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
    tab: "px-2",
    // The row stops growing at 1440px, so with ten tabs the name never fits: it pushed the
    // capsule over the logo from 2xl up. It stays readable to screen readers; a badge shows the mode.
    accountName: "sr-only",
    // Ten tabs already fill the capsule; icons wait for the admin area's own review.
    tabIcon: "hidden",
    modeBadge: "flex",
  },
} as const;

type Layout = (typeof LAYOUTS)[keyof typeof LAYOUTS];

/** `canReview`: only role admin reviews supplier products (the queue's server functions check it). */
function useNavCounts(isAdmin: boolean, canReview: boolean) {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  const productReviews = useQuery({ ...reviewQueueCountQueryOptions(), enabled: canReview });
  return {
    counts: {
      failedListings: attention.data?.failedListings ?? 0,
      openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
      productReviews: canReview ? (productReviews.data ?? 0) : 0,
      supportReplies: attention.data?.unreadSupportReplies ?? 0,
    } satisfies BadgeCounts,
  };
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact === true) {
    return pathname === item.to;
  }
  return [item.to, ...(item.also ?? [])].some((target) => isActivePath(pathname, target));
}

function NavTab({
  item,
  isActive,
  count,
  paintsOwnPill = true,
  tabRef,
  onNavigate,
  padding = "px-4",
  withHint = false,
  iconClassName = "size-5",
}: {
  item: NavItem;
  isActive: boolean;
  count: number;
  /** False while a shared sliding pill sits behind the active tab instead. */
  paintsOwnPill?: boolean;
  tabRef?: Ref<HTMLAnchorElement>;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Horizontal padding from the header layout. */
  padding?: string;
  /** Desktop tabs explain their section on hover; in the phone sheet a tap just opens it. */
  withHint?: boolean;
  /** Icon classes from the header layout. */
  iconClassName?: string;
}) {
  const description = item.badge && count > 0 ? BADGE_DESCRIPTIONS[item.badge](count) : null;
  const action = tabAction(item);
  const TabIcon = action?.icon;
  const link = (
    <Link
      ref={tabRef}
      to={item.to}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={navTabClassName({ isActive, paintsOwnPill, padding })}
    >
      {TabIcon ? <TabIcon className={cn("shrink-0", iconClassName)} aria-hidden="true" /> : null}
      {item.label}
      {description ? (
        <TabBadge
          isError={item.badge === "failedListings"}
          count={count}
          description={description}
        />
      ) : null}
    </Link>
  );
  return (
    <Hint label={withHint ? action?.hint : undefined} openOnTap={false}>
      {link}
    </Hint>
  );
}

function tabAction(item: NavItem): ActionIcon | undefined {
  const name = NAV_TAB_ICONS[item.to];
  if (name === undefined) {
    return undefined;
  }
  return ACTION_ICONS[name];
}

const MenuIcon = ACTION_ICONS.menu.icon;

function MobileNav({
  items,
  pathname,
  counts,
  layout,
}: {
  items: NavItem[];
  pathname: string;
  counts: BadgeCounts;
  layout: Layout;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <Hint label={ACTION_ICONS.menu.hint} openOnTap={false}>
        <SheetTrigger
          aria-label="Abrir menu"
          className={cn(
            // On phones the label pushed the logo under the search button (measured at 390px);
            // the three-line icon stands alone there, like search and close.
            "flex size-11 items-center justify-center gap-2 rounded-full bg-muted text-sm font-medium text-foreground sm:w-auto sm:pr-4 sm:pl-3.5",
            layout.sheetTrigger,
          )}
        >
          <MenuIcon className="size-5" aria-hidden="true" />
          <span aria-hidden="true" className="hidden sm:inline">
            Menu
          </span>
        </SheetTrigger>
      </Hint>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <nav aria-label="Principal" className="mt-10 grid gap-1">
          {[...items, SUPPORT_NAV_ITEM].map((item) => (
            <NavTab
              key={item.to}
              item={item}
              isActive={isItemActive(item, pathname)}
              count={item.badge ? counts[item.badge] : 0}
              onNavigate={() => setIsOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
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
  profileGroup,
  pathname,
  counts,
  layout,
}: {
  items: NavItem[];
  /** Team mode folds the profile's own tabs into one menu tab ahead of the team's. */
  profileGroup: ProfileGroup | null;
  pathname: string;
  counts: BadgeCounts;
  layout: Layout;
}) {
  const allItems = [...(profileGroup?.items ?? []), ...items];
  const activeTo = allItems.find((item) => isItemActive(item, pathname))?.to ?? null;
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
      {profileGroup ? (
        <ProfileTabsMenu
          label={profileGroup.label}
          items={profileGroup.items}
          activeTo={chosen.value}
          counts={counts}
          paintsOwnPill={indicator === null}
          padding={layout.tab}
          triggerRef={(node) => registerTab(profileGroup.items, node)}
          onChoose={chosen.choose}
        />
      ) : null}
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
}

/** Tabs for the phone sheet (all of them) and for the desktop capsule (profile ones folded). */
function navigationFor(user: SessionUser, adminMode: boolean, isSupplier: boolean) {
  const profileItems = isSupplier ? SUPPLIER_NAV_ITEMS : NAV_ITEMS;
  if (!adminMode) {
    return { items: profileItems, desktopItems: profileItems, profileGroup: null };
  }
  const teamItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.permission || hasStaffPermission(user.role, item.permission),
  );
  return {
    items: [...profileItems, ...teamItems],
    desktopItems: teamItems,
    profileGroup: { label: isSupplier ? "Fornecedor" : "Revendedor", items: profileItems },
  };
}

/** App header: logo, the pill navigation and the account chip, as one floating row. */
export function TopNav({ user, adminMode, profileKind }: TopNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { counts } = useNavCounts(adminMode, adminMode && user.role === "admin");
  const supportReplies = counts.supportReplies;
  const isSupplier = profileKind === "supplier";
  const { items, desktopItems, profileGroup } = navigationFor(user, adminMode, isSupplier);
  const layout = adminMode ? LAYOUTS.dense : LAYOUTS.regular;
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
          <MobileNav items={items} pathname={pathname} counts={counts} layout={layout} />
          <Link
            to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
            aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
            className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <BrandIcon className="size-10" />
          </Link>
        </div>
        <DesktopNav
          items={desktopItems}
          profileGroup={profileGroup}
          pathname={pathname}
          counts={counts}
          layout={layout}
        />
        <div className="flex items-center gap-2 justify-self-end">
          {/* The search looks through the seller's orders, listings and stores. */}
          {isSupplier ? null : <CommandPalette />}
          {/* In admin mode the team is answering tickets; their own support stays in the menu. */}
          {adminMode ? null : (
            <div className="hidden sm:block">
              <SupportButton unread={supportReplies} />
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
      </div>
    </header>
  );
}
