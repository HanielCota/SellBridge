import { ShieldCheckIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Fragment, useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
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
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { SupportButton } from "./support-button";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { accountLabel } from "@/features/auth/account-label";
import { UserMenu } from "./user-menu";

type BadgeCounts = Record<NavBadge, number>;

/**
 * Admin mode adds up to three team tabs, and nine tabs no longer fit a capsule centred
 * between equal side columns (the row is capped at 1440px). The dense layout sizes the side
 * columns to their content, trims the tab padding, hides the account name behind a badge and
 * moves the tabs into the menu sheet below xl. Full class strings, so Tailwind sees them.
 */
const LAYOUTS = {
  regular: {
    row: "lg:grid-cols-[1fr_auto_1fr]",
    desktopNav: "lg:flex",
    sheetTrigger: "lg:hidden",
    // Slightly tighter than the sheet's tabs: at full size the capsule pressed against the logo.
    tab: "px-3 text-[0.9375rem] gap-1.5",
    // From lg to xl the capsule and the name no longer fit the row; the avatar alone stays.
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
    // Ten tabs fill the capsule, so the icons stay in the phone sheet (admin section 0).
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
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-full text-base whitespace-nowrap transition-[background-color,color,scale] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
        isActive
          ? "font-medium text-background"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        isActive && paintsOwnPill && "bg-foreground",
        padding,
      )}
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

function TabBadge({
  isError,
  count,
  description,
}: {
  isError: boolean;
  count: number;
  description: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
          isError ? "bg-destructive/15 text-destructive" : "bg-brand/20 text-brand-text",
        )}
      >
        {count}
      </span>
      <span className="sr-only">, {description}</span>
    </>
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

/** Where the team's own tabs begin, so a hairline can set them apart from the profile's. */
function startsTeamArea(items: readonly NavItem[], index: number): boolean {
  const item = items[index];
  const previous = items[index - 1];
  if (item === undefined || previous === undefined) {
    return false;
  }
  return ADMIN_NAV_ITEMS.includes(item) && !ADMIN_NAV_ITEMS.includes(previous);
}

function TeamDivider({ vertical }: { vertical: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 bg-border", vertical ? "mx-1 h-5 w-px" : "mx-3 my-1.5 h-px")}
    />
  );
}

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
          {[...items, SUPPORT_NAV_ITEM].map((item, index, all) => (
            <Fragment key={item.to}>
              {startsTeamArea(all, index) ? <TeamDivider vertical={false} /> : null}
              <NavTab
                item={item}
                isActive={isItemActive(item, pathname)}
                count={item.badge ? counts[item.badge] : 0}
                onNavigate={() => setIsOpen(false)}
              />
            </Fragment>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The tab capsule. One lit pill glides to the page you pick, like the period and status
 * controls; it moves on the click, while the next page still loads.
 */
function DesktopNav({
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
  const activeTo = items.find((item) => isItemActive(item, pathname))?.to ?? null;
  const chosen = useOptimisticChoice(activeTo);
  const containerRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string | null, HTMLElement>());
  const indicator = useActiveIndicator(chosen.value, containerRef, tabRefs);
  const canAnimate = useAnimateAfterFirstPaint(indicator !== null);
  return (
    <nav
      ref={containerRef}
      aria-label="Principal"
      className={cn(
        "relative hidden items-center gap-0.5 rounded-full bg-card p-1.5",
        layout.desktopNav,
      )}
    >
      {indicator && chosen.value !== null ? (
        <TrackPill box={indicator} canAnimate={canAnimate} className="inset-y-1.5" />
      ) : null}
      {items.map((item, index) => (
        <Fragment key={item.to}>
          {startsTeamArea(items, index) ? <TeamDivider vertical /> : null}
          <NavTab
            item={item}
            isActive={item.to === chosen.value}
            count={item.badge ? counts[item.badge] : 0}
            paintsOwnPill={indicator === null}
            padding={layout.tab}
            withHint
            iconClassName={layout.tabIcon}
            tabRef={(node) => {
              if (!node) {
                tabRefs.current.delete(item.to);
                return;
              }
              tabRefs.current.set(item.to, node);
            }}
            onNavigate={(event) => {
              // A click that opens a new tab leaves this page where it is.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                return;
              }
              chosen.choose(item.to);
            }}
          />
        </Fragment>
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

interface TopNavProps {
  readonly user: SessionUser;
  readonly adminMode: boolean;
  readonly profileKind: ProfileKind;
}

/** App header: logo, the pill navigation and the account chip, as one floating row. */
export function TopNav({ user, adminMode, profileKind }: TopNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { counts } = useNavCounts(adminMode, adminMode && user.role === "admin");
  const supportReplies = counts.supportReplies;
  const teamItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.permission || hasStaffPermission(user.role, item.permission),
  );
  const isSupplier = profileKind === "supplier";
  const profileItems = isSupplier ? SUPPLIER_NAV_ITEMS : NAV_ITEMS;
  const items = adminMode ? [...profileItems, ...teamItems] : profileItems;
  const layout = adminMode ? LAYOUTS.dense : LAYOUTS.regular;
  return (
    <header className="sticky top-0 z-30 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {/* Equal side columns keep the tab capsule centred on the page (dense: see LAYOUTS). */}
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
        <DesktopNav items={items} pathname={pathname} counts={counts} layout={layout} />
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
