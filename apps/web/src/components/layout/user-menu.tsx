import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import {
  IdentificationCardIcon,
  MoonIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SunIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/features/auth/session.functions";
import { useTeamModeSwitch } from "@/features/auth/use-team-mode-switch";
import { authClient } from "@/lib/auth-client";
import { forgetTabProfile } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";
import { type AccountMenuEntry, accountMenuEntries } from "./account-pages";

const appRoute = getRouteApi("/_app");

function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async function signOut() {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    // Cached sessions and profile data belong to the user who just left.
    queryClient.clear();
    forgetTabProfile();
    await navigate({ to: "/login" });
  };
}

/** Rows read as plain choices: full-strength labels, quieter icons. */
const MENU_ROW =
  "gap-3 px-2.5 py-2.5 text-base text-foreground [&_svg:not([class*='size-'])]:size-5 [&_svg]:text-muted-foreground data-highlighted:[&_svg]:text-foreground";

/**
 * The label names the theme a click turns on. The menu stays open: the page changes color under
 * it and the row flips to the way back, and closing it would animate the card's caret during the
 * swap the theme keeps free of fades.
 */
function ThemeItem() {
  const { theme, toggleTheme } = useTheme();
  const ThemeIcon = theme === "dark" ? SunIcon : MoonIcon;
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        toggleTheme();
      }}
      className={MENU_ROW}
    >
      <ThemeIcon aria-hidden="true" />
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </DropdownMenuItem>
  );
}

/** Shows or hides the team tools in the interface; only offered to team accounts. */
function TeamModeItem({ enabled, role }: { enabled: boolean; role: string }) {
  const { name, switchTeamMode } = useTeamModeSwitch(role);
  return (
    <DropdownMenuCheckboxItem
      checked={enabled}
      onCheckedChange={(checked) => void switchTeamMode(checked)}
      onSelect={(event) => event.preventDefault()}
      className={cn(MENU_ROW, "pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden")}
    >
      <ShieldCheckIcon aria-hidden="true" />
      {name}
      {/* Drawn like the Switch so on/off reads at a glance; the item itself carries the state. */}
      <span
        aria-hidden="true"
        className={cn(
          "ml-auto flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors",
          enabled ? "bg-brand" : "bg-foreground/45 dark:bg-input",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
            enabled && "translate-x-3",
          )}
        />
      </span>
    </DropdownMenuCheckboxItem>
  );
}

function MenuLink({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: "/perfil" | "/onboarding";
  icon: ReactNode;
  label: string;
  onNavigate: (() => void) | undefined;
}) {
  return (
    <DropdownMenuItem asChild className={MENU_ROW}>
      <Link to={to} onClick={onNavigate}>
        {icon}
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function MenuEntry({
  entry,
  user,
  adminMode,
  onNavigate,
  onSignOut,
}: {
  entry: AccountMenuEntry;
  user: SessionUser;
  adminMode: boolean;
  onNavigate: (() => void) | undefined;
  onSignOut: () => void;
}) {
  if (entry === "profile") {
    const icon = <UserCircleIcon aria-hidden="true" />;
    return <MenuLink to="/perfil" icon={icon} label="Meu perfil" onNavigate={onNavigate} />;
  }
  if (entry === "sellerData") {
    const icon = <IdentificationCardIcon aria-hidden="true" />;
    return <MenuLink to="/onboarding" icon={icon} label="Meu cadastro" onNavigate={onNavigate} />;
  }
  if (entry === "teamMode") {
    return <TeamModeItem enabled={adminMode} role={user.role} />;
  }
  if (entry === "theme") {
    return <ThemeItem />;
  }
  return (
    <>
      <DropdownMenuSeparator className="-mx-1.5" />
      <DropdownMenuItem onSelect={onSignOut} className={MENU_ROW}>
        <SignOutIcon aria-hidden="true" />
        Sair da conta
      </DropdownMenuItem>
    </>
  );
}

interface UserMenuProps {
  user: SessionUser;
  adminMode: boolean;
  /** A supplier's menu leaves out the reseller's registration (`accountMenuEntries`). */
  profileKind: ProfileKind;
  /** What the card shows (photo, name, e-mail, caret); the whole card opens the menu. */
  children: ReactNode;
  className?: string;
  /** Closes the phone sheet when a link of the menu opens a page. */
  onNavigate?: (() => void) | undefined;
}

/**
 * The profile card's menu, opening above the card at the foot of the sidebar: the profile, the
 * registration, the team mode, the theme and signing out, last.
 */
export function UserMenu({
  user,
  adminMode,
  profileKind,
  children,
  className,
  onNavigate,
}: UserMenuProps) {
  const signOut = useSignOut();
  // Opened with the mouse, closing should not hand focus back to the card and light its ring;
  // from the keyboard it still does, so you know where you are.
  const openedWithPointer = useRef(false);
  const teamOnly = appRoute.useRouteContext({ select: (context) => context.session.teamOnly });
  const entries = accountMenuEntries({ profileKind, isStaff: isStaffRole(user.role), teamOnly });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onPointerDown={() => {
          openedWithPointer.current = true;
        }}
        onKeyDown={() => {
          openedWithPointer.current = false;
        }}
        className={cn(
          "group flex items-center gap-3 text-left select-none transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.98] active:duration-100 motion-reduce:active:scale-100",
          className,
        )}
      >
        {/* Named by its content, not an aria-label, so the name contains the visible name and role. */}
        <span className="sr-only">Menu do usuário: </span>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        onCloseAutoFocus={(event) => {
          if (openedWithPointer.current) {
            event.preventDefault();
          }
        }}
        // As wide as the card, or wider when a row needs it ("Modo administrador" and its switch).
        className="w-max max-w-[calc(100vw-2rem)] min-w-(--radix-dropdown-menu-trigger-width) rounded-2xl border-0 p-1.5 shadow-black/15 ring-1 ring-border"
      >
        {entries.map((entry) => (
          <MenuEntry
            key={entry}
            entry={entry}
            user={user}
            adminMode={adminMode}
            onNavigate={onNavigate}
            onSignOut={() => void signOut()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
