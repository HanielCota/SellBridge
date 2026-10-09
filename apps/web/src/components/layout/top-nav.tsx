import { ListIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useState } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
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
  type NavBadge,
  type NavItem,
} from "./nav-items";
import { AvatarButton } from "@/components/profile/avatar-button";
import { roleLabel, UserMenu } from "./user-menu";

type BadgeCounts = Record<NavBadge, number>;

function useNavCounts(isAdmin: boolean) {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  return {
    counts: {
      failedListings: attention.data?.failedListings ?? 0,
      openTickets: isAdmin ? (openTickets.data ?? 0) : 0,
    } satisfies BadgeCounts,
    supportReplies: attention.data?.answeredTickets ?? 0,
  };
}

function NavTab({
  item,
  pathname,
  count,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  count: number;
  onNavigate?: () => void;
}) {
  const isActive = [item.to, ...(item.also ?? [])].some((target) => isActivePath(pathname, target));
  const description = item.badge && count > 0 ? BADGE_DESCRIPTIONS[item.badge](count) : null;
  return (
    <Link
      to={item.to}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        isActive
          ? "bg-foreground font-medium text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.label}
      {description ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
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
}: {
  items: NavItem[];
  pathname: string;
  counts: BadgeCounts;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger
        aria-label="Abrir menu"
        className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground lg:hidden"
      >
        <ListIcon className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <nav aria-label="Principal" className="mt-10 grid gap-1">
          {items.map((item) => (
            <NavTab
              key={item.to}
              item={item}
              pathname={pathname}
              count={item.badge ? counts[item.badge] : 0}
              onNavigate={() => setIsOpen(false)}
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/** Pages reached from the account menu; the account chip shows as "you are here" on them. */
const ACCOUNT_PATHS = ["/perfil", "/onboarding", "/suporte"];

function AccountChip({
  user,
  supportReplies,
  adminMode,
}: {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
}) {
  const isOnAccountPage = useRouterState({
    select: (state) => ACCOUNT_PATHS.some((path) => isActivePath(state.location.pathname, path)),
  });
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full bg-card p-1.5",
        isOnAccountPage && "ring-1 ring-brand/60",
      )}
    >
      <AvatarButton name={user.name} image={user.image} />
      <span className="hidden min-w-0 leading-tight sm:block">
        <span className="block max-w-36 truncate text-sm font-medium">{user.name}</span>
        {adminMode ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand-text">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            Modo admin ativo
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">{roleLabel(user.role)}</span>
        )}
      </span>
      <UserMenu user={user} supportReplies={supportReplies} adminMode={adminMode} />
    </div>
  );
}

/** App header: logo, the pill navigation and the account chip, as one floating row. */
export function TopNav({ user, adminMode }: { user: SessionUser; adminMode: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { counts, supportReplies } = useNavCounts(adminMode);
  const items = adminMode ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl">
      {/* Equal side columns keep the tab capsule centred on the page, whatever the side widths. */}
      <div className="mx-auto grid max-w-[1440px] grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 md:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-3">
          <MobileNav items={items} pathname={pathname} counts={counts} />
          <Link
            to="/dashboard"
            aria-label="SellBridge — Visão geral"
            className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <BrandIcon className="size-10" />
          </Link>
        </div>
        <nav
          aria-label="Principal"
          className="hidden items-center gap-1 rounded-full bg-card p-1.5 lg:flex"
        >
          {items.map((item) => (
            <NavTab
              key={item.to}
              item={item}
              pathname={pathname}
              count={item.badge ? counts[item.badge] : 0}
            />
          ))}
        </nav>
        <div className="justify-self-end">
          <AccountChip user={user} supportReplies={supportReplies} adminMode={adminMode} />
        </div>
      </div>
    </header>
  );
}
