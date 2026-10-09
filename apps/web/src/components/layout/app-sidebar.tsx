import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { SessionUser } from "@/features/auth/session.functions";
import { ADMIN_NAV_SECTION, NAV_SECTIONS, type NavSection } from "./nav-items";
import { UserMenu } from "./user-menu";

function isActivePath(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(`${target}/`);
}

function visibleSections(user: SessionUser): NavSection[] {
  if (user.role !== "admin" || !ADMIN_NAV_SECTION) {
    return NAV_SECTIONS;
  }
  return [...NAV_SECTIONS, ADMIN_NAV_SECTION];
}

export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ArrowLeftRight className="size-4" aria-hidden="true" />
                </span>
                <span className="font-semibold">SellBridge</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {visibleSections(user).map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, item.to)}
                      tooltip={item.label}
                    >
                      <Link to={item.to}>
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
