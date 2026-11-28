import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
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
import { SolarIcon, type SolarIconName } from "./solar-icon";

const appRoute = getRouteApi("/_app");
/** Keeps the menu off the window edge on a narrow phone. */
const MENU_COLLISION_PADDING_IN_PX = 8;

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

/**
 * The theme as an on/off switch: moon and sun beside the knob. It reads as "Tema escuro", checked
 * in the dark theme. The menu stays open: the page changes color under it and the knob is seen
 * moving, and closing it would animate the card's caret during the swap the theme keeps free of
 * fades.
 */
function ThemeItem() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuCheckboxItem
      checked={theme === "dark"}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      onSelect={(event) => event.preventDefault()}
      // min-h-11: a 44 px target for a thumb on a phone.
      className="staff-account-row min-h-11 pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden"
    >
      <SolarIcon name="theme" />
      <span>
        Tema<span className="sr-only"> escuro</span>
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-1" aria-hidden="true">
        <SolarIcon name="moon" className="size-4" />
        <SolarIcon name="sun" className="size-4" />
        <span className="staff-account-toggle" />
      </span>
    </DropdownMenuCheckboxItem>
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
      className="staff-account-row pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden"
    >
      <SolarIcon name="shield" />
      {name}
      {/* Drawn like the Switch so on/off reads at a glance; the item itself carries the state. */}
      <span className="staff-account-toggle" aria-hidden="true" />
    </DropdownMenuCheckboxItem>
  );
}

function MenuLink({
  to,
  icon,
  label,
}: {
  to: "/perfil" | "/onboarding";
  icon: SolarIconName;
  label: string;
}) {
  return (
    <DropdownMenuItem asChild className="staff-account-row">
      <Link to={to}>
        <SolarIcon name={icon} />
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function MenuEntry({
  entry,
  user,
  adminMode,
  onSignOut,
}: {
  entry: AccountMenuEntry;
  user: SessionUser;
  adminMode: boolean;
  onSignOut: () => void;
}) {
  if (entry === "profile") {
    return <MenuLink to="/perfil" icon="profile" label="Meu perfil" />;
  }
  if (entry === "sellerData") {
    return <MenuLink to="/onboarding" icon="id" label="Meu cadastro" />;
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
      <DropdownMenuItem onSelect={onSignOut} className="staff-account-row">
        <SolarIcon name="exit" />
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
}

/**
 * The header account card's menu, opening below the card: the e-mail, the profile, the
 * registration, the team mode, the theme and signing out, last.
 */
export function UserMenu({ user, adminMode, profileKind, children, className }: UserMenuProps) {
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
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={MENU_COLLISION_PADDING_IN_PX}
        onCloseAutoFocus={(event) => {
          if (openedWithPointer.current) {
            event.preventDefault();
          }
        }}
        className="staff-account-menu staff-account-menu-header"
      >
        <DropdownMenuLabel className="staff-account-email">
          <bdi dir="ltr">{user.email}</bdi>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entries.map((entry) => (
          <MenuEntry
            key={entry}
            entry={entry}
            user={user}
            adminMode={adminMode}
            onSignOut={() => void signOut()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
