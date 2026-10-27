import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { useState } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { SegmentedControl } from "@/components/data/segmented-control";
import { Hint } from "@/components/ui/hint";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { activeNavItemTo, SUPPORT_NAV_ITEM, type NavItem } from "@/features/navigation/nav-items";
import { PROFILE_LABELS, type ProfileSection } from "@/features/navigation/profile-sections";
import { cn } from "@/lib/utils";
import { isItemActive, NavTab, TeamDivider, type BadgeCounts } from "./nav-tab";
import { TeamModeMenuEntry } from "./team-mode-entry";

const MenuIcon = ACTION_ICONS.menu.icon;

const PROFILE_TAB_ICONS = {
  seller: ACTION_ICONS.resellerTabs.icon,
  supplier: ACTION_ICONS.supplierTabs.icon,
} as const;

/** The phone sheet's tabs: in admin mode, one profile at a time and then the team's. */
export interface MobileNavigation {
  profileItems: readonly NavItem[];
  /** Admin mode only: every profile the admin can open, each one a tab of the sheet's switch. */
  profileSections: readonly ProfileSection[];
  teamItems: readonly NavItem[];
}

export function MobileNav({
  navigation,
  profileKind,
  pathname,
  counts,
  triggerClassName,
  teamModeRole,
}: {
  navigation: MobileNavigation;
  profileKind: ProfileKind;
  pathname: string;
  counts: BadgeCounts;
  /** Hides the trigger where the desktop capsule takes over. */
  triggerClassName: string;
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
  return (
    <Sheet open={isOpen} onOpenChange={openSheet}>
      <MenuTrigger className={triggerClassName} />
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="sr-only">Navegação</SheetTitle>
        <ProfileSwitch
          sections={navigation.profileSections}
          shownKind={shownKind}
          onChange={setShownKind}
        />
        <nav
          aria-label="Principal"
          className={cn("grid gap-1", hasProfileSwitch(navigation) ? "mt-3" : "mt-10")}
        >
          <MobileNavLinks
            navigation={navigation}
            shownKind={shownKind}
            pathname={pathname}
            counts={counts}
            onNavigate={close}
            teamModeRole={teamModeRole}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLinks({
  navigation,
  shownKind,
  pathname,
  counts,
  onNavigate,
  teamModeRole,
}: {
  navigation: MobileNavigation;
  shownKind: ProfileKind;
  pathname: string;
  counts: BadgeCounts;
  onNavigate: () => void;
  teamModeRole: string | null;
}) {
  const activeTo = currentMobileTab(navigation, pathname);
  return (
    <>
      {teamModeRole === null ? null : (
        <TeamModeMenuEntry role={teamModeRole} onEnter={onNavigate} />
      )}
      <ProfileTabs
        navigation={navigation}
        shownKind={shownKind}
        pathname={pathname}
        counts={counts}
        onNavigate={onNavigate}
      />
      <TeamTabs
        items={navigation.teamItems}
        pathname={pathname}
        counts={counts}
        onNavigate={onNavigate}
      />
      <TeamDivider vertical={false} />
      <NavTab
        item={SUPPORT_NAV_ITEM}
        isActive={activeTo === SUPPORT_NAV_ITEM.to}
        count={counts.supportReplies}
        onNavigate={onNavigate}
      />
    </>
  );
}

function currentMobileTab(navigation: MobileNavigation, pathname: string) {
  const currentItems =
    navigation.profileSections.find((section) => section.slug === null)?.items ??
    navigation.profileItems;
  return activeNavItemTo([...currentItems, ...navigation.teamItems, SUPPORT_NAV_ITEM], pathname);
}

function hasProfileSwitch(navigation: MobileNavigation): boolean {
  return navigation.profileSections.length > 1;
}

function MenuTrigger({ className }: { className: string }) {
  return (
    <Hint label={ACTION_ICONS.menu.hint} openOnTap={false}>
      <SheetTrigger
        aria-label="Abrir menu"
        className={cn(
          // On phones the label pushed the logo under the search button (measured at 390px);
          // the three-line icon stands alone there, like search and close.
          "flex size-11 items-center justify-center gap-2 rounded-full bg-muted text-sm font-medium text-foreground sm:w-auto sm:pr-4 sm:pl-3.5",
          className,
        )}
      >
        <MenuIcon className="size-5" aria-hidden="true" />
        <span aria-hidden="true" className="hidden sm:inline">
          Menu
        </span>
      </SheetTrigger>
    </Hint>
  );
}

/** Revendedor | Fornecedor, when the admin can open both: the list below shows one at a time. */
function ProfileSwitch({
  sections,
  shownKind,
  onChange,
}: {
  sections: readonly ProfileSection[];
  shownKind: ProfileKind;
  onChange: (kind: ProfileKind) => void;
}) {
  if (sections.length < 2) {
    return null;
  }
  return (
    <div className="mt-10">
      <SegmentedControl
        legend="Perfil"
        options={sections.map((section) => section.kind)}
        labels={PROFILE_LABELS}
        icons={PROFILE_TAB_ICONS}
        stretch
        value={shownKind}
        onChange={onChange}
      />
    </div>
  );
}

function ProfileTabs({
  navigation,
  shownKind,
  pathname,
  counts,
  onNavigate,
}: {
  navigation: MobileNavigation;
  shownKind: ProfileKind;
  pathname: string;
  counts: BadgeCounts;
  onNavigate: () => void;
}) {
  const section = navigation.profileSections.find((candidate) => candidate.kind === shownKind);
  const items = section?.items ?? navigation.profileItems;
  const profileSlug = section?.slug ?? null;
  const activeTo = activeNavItemTo([...items, SUPPORT_NAV_ITEM], pathname);
  return items.map((item) => (
    <NavTab
      key={item.to}
      item={item}
      isActive={profileSlug === null && item.to === activeTo}
      // The counters belong to the tab's own profile, not to the one being peeked at.
      count={item.badge && profileSlug === null ? counts[item.badge] : 0}
      profileSlug={profileSlug}
      onNavigate={onNavigate}
    />
  ));
}

/** The team's tabs under their own title, so "Fornecedores" never reads as the supplier profile. */
function TeamTabs({
  items,
  pathname,
  counts,
  onNavigate,
}: {
  items: readonly NavItem[];
  pathname: string;
  counts: BadgeCounts;
  onNavigate: () => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <h2 className="px-4 pt-3 pb-1 text-caption font-medium text-muted-foreground">
        Administração
      </h2>
      {items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={isItemActive(item, pathname)}
          count={item.badge ? counts[item.badge] : 0}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
