import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import {
  CircleHalfIcon,
  IdentificationCardIcon,
  ShieldCheckIcon,
  SignOutIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import { ThemeSwitchTrack } from "@/components/theme/theme-switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/features/auth/session.functions";
import { useTeamModeSwitch } from "@/features/auth/use-team-mode-switch";
import { authClient } from "@/lib/auth-client";
import { forgetTabProfile } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";
import { type AccountMenuEntry, accountMenuEntries } from "./account-pages";

import { SolarIcon } from "./solar-icon";

const appRoute = getRouteApi("/_app");

/** Signs out and clears what belonged to the account; the signing screen reuses it. */
export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async function signOut() {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Você continua na conta. Confira a internet e toque em Sair de novo.");
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
 * The theme as an on/off switch: moon on the left, sun on the right, the knob beside the theme in
 * use. It reads as "Tema escuro", checked in the dark theme. The menu stays open: the page changes
 * color under it and the knob is seen moving, and closing it would animate the card's caret during
 * the swap the theme keeps free of fades.
 */
function ThemeItem({ sidebar }: { sidebar: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuCheckboxItem
      checked={theme === "dark"}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      onSelect={(event) => event.preventDefault()}
      // min-h-11: a 44 px target for a thumb on a phone.
      className={cn(
        sidebar ? "staff-account-row" : MENU_ROW,
        "min-h-11 pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden",
      )}
    >
      {sidebar ? <SolarIcon name="theme" /> : <CircleHalfIcon aria-hidden="true" />}
      <span>
        Tema<span className="sr-only"> escuro</span>
      </span>
      {sidebar ? (
        <span className="ms-auto flex shrink-0 items-center gap-1" aria-hidden="true">
          <SolarIcon name="moon" className="size-4" />
          <SolarIcon name="sun" className="size-4" />
          <span className="staff-account-toggle" />
        </span>
      ) : (
        <ThemeSwitchTrack theme={theme} />
      )}
    </DropdownMenuCheckboxItem>
  );
}

/** Shows or hides the team tools in the interface; only offered to team accounts. */
function TeamModeItem({
  enabled,
  role,
  sidebar,
}: {
  enabled: boolean;
  role: string;
  sidebar: boolean;
}) {
  const { name, switchTeamMode } = useTeamModeSwitch(role);
  return (
    <DropdownMenuCheckboxItem
      checked={enabled}
      onCheckedChange={(checked) => void switchTeamMode(checked)}
      onSelect={(event) => event.preventDefault()}
      className={cn(
        sidebar ? "staff-account-row" : MENU_ROW,
        "pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden",
      )}
    >
      {sidebar ? <SolarIcon name="shield" /> : <ShieldCheckIcon aria-hidden="true" />}
      {name}
      {/* Drawn like the Switch so on/off reads at a glance; the item itself carries the state. */}
      {sidebar ? (
        <span className="staff-account-toggle" aria-hidden="true" />
      ) : (
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
      )}
    </DropdownMenuCheckboxItem>
  );
}

function MenuLink({
  to,
  icon,
  label,
  sidebar,
  onNavigate,
}: {
  to: "/perfil" | "/onboarding";
  icon: ReactNode;
  label: string;
  sidebar: boolean;
  onNavigate: (() => void) | undefined;
}) {
  return (
    <DropdownMenuItem asChild className={sidebar ? "staff-account-row" : MENU_ROW}>
      <Link to={to} onClick={onNavigate}>
        {icon}
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function MenuEntry({
  entry,
  sidebar,
  user,
  adminMode,
  onNavigate,
  onSignOut,
}: {
  entry: AccountMenuEntry;
  sidebar: boolean;
  user: SessionUser;
  adminMode: boolean;
  onNavigate: (() => void) | undefined;
  onSignOut: () => void;
}) {
  if (entry === "profile") {
    const icon = sidebar ? <SolarIcon name="profile" /> : <UserCircleIcon aria-hidden="true" />;
    return (
      <MenuLink
        to="/perfil"
        icon={icon}
        sidebar={sidebar}
        label="Meu perfil"
        onNavigate={onNavigate}
      />
    );
  }
  if (entry === "sellerData") {
    const icon = sidebar ? <SolarIcon name="id" /> : <IdentificationCardIcon aria-hidden="true" />;
    return (
      <MenuLink
        to="/onboarding"
        icon={icon}
        sidebar={sidebar}
        label="Meu cadastro"
        onNavigate={onNavigate}
      />
    );
  }
  if (entry === "teamMode") {
    return <TeamModeItem enabled={adminMode} role={user.role} sidebar={sidebar} />;
  }
  if (entry === "theme") {
    return <ThemeItem sidebar={sidebar} />;
  }
  return (
    <>
      <DropdownMenuSeparator className="-mx-1.5" />
      <DropdownMenuItem onSelect={onSignOut} className={sidebar ? "staff-account-row" : MENU_ROW}>
        {sidebar ? <SolarIcon name="exit" /> : <SignOutIcon aria-hidden="true" />}
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
  sidebar?: boolean;
  inHeader?: boolean;
  /** Closes the phone sheet when a link of the menu opens a page. */
  onNavigate?: (() => void) | undefined;
}

function AccountItems({
  entries,
  user,
  adminMode,
  sidebar,
  onNavigate,
  onSignOut,
}: Omit<Parameters<typeof MenuEntry>[0], "entry"> & { entries: readonly AccountMenuEntry[] }) {
  return (
    <>
      {sidebar ? (
        <>
          <DropdownMenuLabel className="staff-account-email">
            <bdi dir="ltr">{user.email}</bdi>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </>
      ) : null}
      {entries.map((entry) => (
        <MenuEntry
          key={entry}
          entry={entry}
          sidebar={sidebar}
          user={user}
          adminMode={adminMode}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
        />
      ))}
    </>
  );
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
  sidebar = false,
  inHeader = false,
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
        side={inHeader ? "bottom" : "top"}
        align={inHeader ? "end" : "start"}
        sideOffset={8}
        collisionPadding={sidebar ? 8 : 0}
        onCloseAutoFocus={(event) => {
          if (openedWithPointer.current) {
            event.preventDefault();
          }
        }}
        // As wide as the card, or wider when a row needs it ("Modo administrador" and its switch).
        className={
          sidebar
            ? cn("staff-account-menu", inHeader && "staff-account-menu-header")
            : "w-max max-w-[calc(100vw-2rem)] min-w-(--radix-dropdown-menu-trigger-width) rounded-2xl border-0 p-1.5 shadow-black/15 ring-1 ring-border"
        }
      >
        <AccountItems
          entries={entries}
          user={user}
          adminMode={adminMode}
          sidebar={sidebar}
          onNavigate={onNavigate}
          onSignOut={() => void signOut()}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
