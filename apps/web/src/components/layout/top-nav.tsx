import { ListIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { useActiveIndicator } from "@/components/data/use-active-indicator";
import { TrackPill } from "@/components/data/track-pill";
import { useOptimisticChoice } from "@/hooks/use-optimistic-choice";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/features/auth/session.functions";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import {
  ADMIN_NAV_ITEMS,
  BADGE_DESCRIPTIONS,
  isActivePath,
  NAV_ITEMS,
  SUPPORT_NAV_ITEM,
  type NavBadge,
  type NavItem,
} from "@/features/navigation/nav-items";
import { UserAvatar } from "./user-avatar";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { SupportButton } from "./support-button";
import { teamModeActiveTag } from "@/features/auth/team-mode";
import { roleLabel, UserMenu } from "./user-menu";

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
    tab: "px-4",
    // From lg to xl the capsule and the name no longer fit the row; the avatar alone stays.
    accountName: "hidden sm:block lg:hidden xl:block",
    modeBadge: "hidden",
  },
  dense: {
    row: "xl:grid-cols-[auto_1fr_auto]",
    desktopNav: "justify-self-center xl:flex",
    sheetTrigger: "xl:hidden",
    tab: "px-3",
    // The row stops growing at 1440px, so with ten tabs the name never fits: it pushed the
    // capsule over the logo from 2xl up. It stays readable to screen readers; a badge shows the mode.
    accountName: "sr-only",
    modeBadge: "flex",
  },
} as const;

type Layout = (typeof LAYOUTS)[keyof typeof LAYOUTS];

function useNavCounts(isAdmin: boolean) {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  return {
    counts: {
      failedListings: attention.data?.failedListings ?? 0,
      openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
      supportReplies: attention.data?.unreadSupportReplies ?? 0,
    } satisfies BadgeCounts,
  };
}

function isItemActive(item: NavItem, pathname: string): boolean {
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
}) {
  const description = item.badge && count > 0 ? BADGE_DESCRIPTIONS[item.badge](count) : null;
  return (
    <Link
      ref={tabRef}
      to={item.to}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-full text-sm whitespace-nowrap transition-[background-color,color,scale] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100",
        isActive
          ? "font-medium text-background"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        isActive && paintsOwnPill && "bg-foreground",
        padding,
      )}
    >
      {item.label}
      {description ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption font-semibold tabular-nums",
              item.badge === "failedListings"
                ? "bg-destructive/15 text-destructive"
                : "bg-brand/20 text-brand-text",
            )}
          >
            {count}
          </span>
          <span className="sr-only">, {description}</span>
        </>
      ) : null}
    </Link>
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
      <SheetTrigger
        aria-label="Abrir menu"
        className={cn(
          "flex size-11 items-center justify-center rounded-full bg-muted text-foreground",
          layout.sheetTrigger,
        )}
      >
        <ListIcon className="size-5" aria-hidden="true" />
      </SheetTrigger>
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
        "relative hidden items-center gap-1 rounded-full bg-card p-1.5",
        layout.desktopNav,
      )}
    >
      {indicator && chosen.value !== null ? (
        <TrackPill box={indicator} canAnimate={canAnimate} className="inset-y-1.5" />
      ) : null}
      {items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={item.to === chosen.value}
          count={item.badge ? counts[item.badge] : 0}
          paintsOwnPill={indicator === null}
          padding={layout.tab}
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
  layout,
}: {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
  layout: Layout;
}) {
  return (
    <UserMenu
      user={user}
      supportReplies={supportReplies}
      adminMode={adminMode}
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
        <span className="block max-w-36 truncate text-sm font-medium">{user.name}</span>
        {adminMode ? (
          <span className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-brand-text">
            <span className="size-1.5 rounded-full bg-brand-mark" aria-hidden="true" />
            {teamModeActiveTag(user.role)}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">{roleLabel(user.role)}</span>
        )}
      </span>
    </UserMenu>
  );
}

/** App header: logo, the pill navigation and the account chip, as one floating row. */
export function TopNav({ user, adminMode }: { user: SessionUser; adminMode: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { counts } = useNavCounts(adminMode);
  const supportReplies = counts.supportReplies;
  const teamItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.permission || hasStaffPermission(user.role, item.permission),
  );
  const items = adminMode ? [...NAV_ITEMS, ...teamItems] : NAV_ITEMS;
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
            to="/dashboard"
            aria-label="SellBridge, visão geral"
            className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <BrandIcon className="size-10" />
          </Link>
        </div>
        <DesktopNav items={items} pathname={pathname} counts={counts} layout={layout} />
        <div className="flex items-center gap-2 justify-self-end">
          <CommandPalette />
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
            layout={layout}
          />
        </div>
      </div>
    </header>
  );
}
