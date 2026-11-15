import { XIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { type ComponentProps, useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/features/auth/session.functions";
import { cn } from "@/lib/utils";
import {
  AccountNavList,
  hasProfileSwitch,
  NavList,
  ProfileSwitch,
  shownMenu,
  type AppNavigation,
} from "./nav-list";
import type { BadgeCounts } from "./nav-tab";
import { ProfileCard } from "./profile-card";
import { SideNavHome } from "./side-nav";
import { TeamModeMenuEntry } from "./team-mode-entry";

const MenuIcon = ACTION_ICONS.menu.icon;

/** The sheet's top row: the logo over a thin line, as in the sidebar, and the close button. */
function SheetHead({ isSupplier, onNavigate }: { isSupplier: boolean; onNavigate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-3 pr-2 pl-4">
      <SideNavHome isSupplier={isSupplier} onNavigate={onNavigate} />
      <SheetClose asChild>
        <Button variant="ghost" size="icon-lg" className="rounded-full">
          <XIcon className="size-5" aria-hidden="true" />
          <span className="sr-only">Fechar</span>
        </Button>
      </SheetClose>
    </div>
  );
}

/** The sheet's scrolling part: the profile switch, the team's way in, the list and its foot. */
function SheetList({
  list,
  shownKind,
  onShownKindChange,
  teamModeRole,
}: {
  list: ComponentProps<typeof NavList> & { onNavigate: () => void };
  shownKind: ProfileKind;
  onShownKindChange: (kind: ProfileKind) => void;
  teamModeRole: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
      <ProfileSwitch
        sections={list.navigation.profileSections}
        shownKind={shownKind}
        onChange={onShownKindChange}
      />
      <nav
        aria-label="Principal"
        className={cn(
          "flex flex-1 flex-col gap-1",
          hasProfileSwitch(list.navigation) ? "mt-3" : null,
        )}
      >
        {teamModeRole === null ? null : (
          <TeamModeMenuEntry role={teamModeRole} onEnter={list.onNavigate} />
        )}
        <NavList {...list} />
        <div className="mt-auto pt-6">
          <AccountNavList {...list} />
        </div>
      </nav>
    </div>
  );
}

/**
 * The menu on phones and tablets, opened from the header; the sidebar takes over from `lg`.
 * Same structure as the sidebar: logo, the list, support at its foot, then the profile card.
 */
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
  const list = {
    navigation,
    shown: shownMenu(navigation, shownKind, pathname),
    counts,
    onNavigate: close,
  };
  return (
    <Sheet open={isOpen} onOpenChange={openSheet}>
      <MenuTrigger />
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 gap-0 overflow-hidden p-0 data-[side=left]:pt-[env(safe-area-inset-top)]"
      >
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <SheetHead isSupplier={profileKind === "supplier"} onNavigate={close} />
        <SheetList
          list={list}
          shownKind={shownKind}
          onShownKindChange={setShownKind}
          teamModeRole={teamModeRole}
        />
        <div className="border-t border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ProfileCard
            user={user}
            adminMode={adminMode}
            profileKind={profileKind}
            onNavigate={close}
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
