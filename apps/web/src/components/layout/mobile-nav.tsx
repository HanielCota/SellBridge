import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/features/auth/session.functions";
import { cn } from "@/lib/utils";
import { AccountChip } from "./account-chip";
import {
  AccountNavList,
  hasProfileSwitch,
  NavList,
  ProfileSwitch,
  type AppNavigation,
} from "./nav-list";
import { TeamDivider, type BadgeCounts } from "./nav-tab";
import { TeamModeMenuEntry } from "./team-mode-entry";

const MenuIcon = ACTION_ICONS.menu.icon;

/** The menu on phones and tablets, opened from the header; the sidebar takes over from `lg`. */
export function MobileNav({
  navigation,
  user,
  adminMode,
  profileKind,
  pathname,
  counts,
  teamModeRole,
}: {
  navigation: AppNavigation;
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  pathname: string;
  counts: BadgeCounts;
  /** Offers the team workspace while a staff member has its mode off. */
  teamModeRole: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [shownKind, setShownKind] = useState<ProfileKind>(profileKind);
  const openSheet = (open: boolean) => {
    // Every opening starts on the tab's own profile, whatever was picked last time.
    setShownKind(profileKind);
    setIsOpen(open);
  };
  const close = () => setIsOpen(false);
  const list = { navigation, shownKind, pathname, counts, onNavigate: close };
  return (
    <Sheet open={isOpen} onOpenChange={openSheet}>
      <MenuTrigger />
      <SheetContent side="left" className="w-72 overflow-y-auto p-4">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <div className="mt-10">
          <ProfileSwitch
            sections={navigation.profileSections}
            shownKind={shownKind}
            onChange={setShownKind}
          />
        </div>
        <nav
          aria-label="Principal"
          className={cn("grid gap-1", hasProfileSwitch(navigation) ? "mt-3" : null)}
        >
          {teamModeRole === null ? null : <TeamModeMenuEntry role={teamModeRole} onEnter={close} />}
          <NavList {...list} />
          <TeamDivider vertical={false} />
          <AccountNavList {...list} />
        </nav>
        <div className="mt-4 border-t border-border pt-3">
          <AccountChip
            user={user}
            supportReplies={counts.supportReplies}
            adminMode={adminMode}
            profileKind={profileKind}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuTrigger() {
  return (
    <Hint label={ACTION_ICONS.menu.hint} openOnTap={false}>
      <SheetTrigger
        aria-label="Abrir menu"
        // On phones the label pushed the logo under the search button (measured at 390px);
        // the three-line icon stands alone there, like search and close.
        className="flex size-11 items-center justify-center gap-2 rounded-full bg-muted text-sm font-medium text-foreground sm:w-auto sm:pr-4 sm:pl-3.5 lg:hidden"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true" className="hidden sm:inline">
          Menu
        </span>
      </SheetTrigger>
    </Hint>
  );
}
