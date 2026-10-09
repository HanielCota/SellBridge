import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { BrandIcon, BrandLogo } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/features/auth/session.functions";
import {
  attentionCountsQueryOptions,
  openTicketCountQueryOptions,
} from "@/features/navigation/navigation.queries";
import {
  ADMIN_NAV_SECTION,
  BADGE_DESCRIPTIONS,
  NAV_SECTIONS,
  type NavBadge,
  type NavItem,
  type NavSection,
  SUPPORT_NAV_ITEM,
} from "./nav-items";
import { UserMenu } from "./user-menu";

type BadgeCounts = Record<NavBadge, number | undefined>;

function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function useBadgeCounts(isAdmin: boolean): BadgeCounts {
  const attention = useQuery(attentionCountsQueryOptions());
  const openTickets = useQuery({ ...openTicketCountQueryOptions(), enabled: isAdmin });
  return {
    failedListings: attention.data?.failedListings,
    answeredTickets: attention.data?.answeredTickets,
    openTickets: isAdmin ? openTickets.data : undefined,
  };
}

/** Logo on the left, collapse button on the right; stacked when the sidebar is collapsed. */
function SidebarBrand() {
  const { isMobile } = useSidebar();
  const trigger = <SidebarTrigger className="text-muted-foreground" />;
  return (
    <SidebarHeader className="h-16 flex-row items-center justify-between gap-2 px-4 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
      <Link
        to="/dashboard"
        aria-label="SellBridge — Visão geral"
        className="flex min-w-0 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BrandLogo
          className="text-lg group-data-[collapsible=icon]:hidden"
          iconClassName="size-8"
        />
        <BrandIcon className="hidden size-8 group-data-[collapsible=icon]:block" />
      </Link>
      {isMobile ? (
        trigger
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">Recolher ou expandir · Ctrl+B</TooltipContent>
        </Tooltip>
      )}
    </SidebarHeader>
  );
}

function NavLink({
  item,
  pathname,
  count,
}: {
  item: NavItem;
  pathname: string;
  count: number | undefined;
}) {
  const description =
    item.badge !== undefined && count !== undefined && count > 0
      ? BADGE_DESCRIPTIONS[item.badge](count)
      : null;
  const hasBadge = description !== null;
  const isActive = isActivePath(pathname, item.to);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={description ? `${item.label} · ${description}` : item.label}
      >
        <Link to={item.to}>
          <item.icon weight={isActive ? "fill" : "regular"} aria-hidden="true" />
          <span>{item.label}</span>
          {description ? <span className="sr-only">, {description}</span> : null}
        </Link>
      </SidebarMenuButton>
      {hasBadge ? (
        <SidebarMenuBadge
          aria-hidden="true"
          data-tone={item.badge === "failedListings" ? "danger" : undefined}
        >
          {count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

function NavSectionGroup({
  section,
  pathname,
  counts,
}: {
  section: NavSection;
  pathname: string;
  counts: BadgeCounts;
}) {
  return (
    <SidebarGroup className="px-3 py-1.5">
      {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              pathname={pathname}
              count={item.badge ? counts[item.badge] : undefined}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAdmin = user.role === "admin";
  const counts = useBadgeCounts(isAdmin);
  const sections =
    isAdmin && ADMIN_NAV_SECTION ? [...NAV_SECTIONS, ADMIN_NAV_SECTION] : NAV_SECTIONS;
  return (
    <Sidebar collapsible="icon">
      <SidebarBrand />
      <SidebarContent className="gap-2 py-2">
        {sections.map((section) => (
          <NavSectionGroup
            key={section.label ?? "home"}
            section={section}
            pathname={pathname}
            counts={counts}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-1 px-3 pt-2 pb-3">
        <SidebarMenu>
          <NavLink item={SUPPORT_NAV_ITEM} pathname={pathname} count={counts.answeredTickets} />
        </SidebarMenu>
        <SidebarSeparator className="mx-0 my-1" />
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
