import { Link, useNavigate } from "@tanstack/react-router";
import { DotsThreeIcon, MapPinIcon, MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { SessionUser } from "@/features/auth/session.functions";
import { authClient } from "@/lib/auth-client";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts.at(0)?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  const result = `${first}${last}`.toUpperCase();
  return result.length > 0 ? result : "?";
}

function ThemeMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <DropdownMenuItem onSelect={toggleTheme}>
      {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
      {isDark ? "Usar tema claro" : "Usar tema escuro"}
    </DropdownMenuItem>
  );
}

function useSignOut() {
  const navigate = useNavigate();
  return async function signOut() {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    await navigate({ to: "/login" });
  };
}

/** Account row at the bottom of the sidebar; settings that are rarely used live in its menu. */
export function UserMenu({ user }: { user: SessionUser }) {
  const signOut = useSignOut();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Menu do usuário"
              className="[&_svg]:text-muted-foreground"
            >
              <Avatar className="size-8 rounded-full">
                <AvatarFallback className="rounded-full bg-brand/15 text-xs font-semibold text-brand-strong dark:text-brand">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <DotsThreeIcon className="ml-auto" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/onboarding">
                <MapPinIcon aria-hidden="true" />
                Minha região
              </Link>
            </DropdownMenuItem>
            <ThemeMenuItem />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <SignOutIcon aria-hidden="true" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
