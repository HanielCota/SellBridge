import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { SegmentedControl } from "@/components/data/segmented-control";
import {
  ACCOUNT_NAV_ITEMS,
  activeNavItemTo,
  navGroups,
  type NavItem,
} from "@/features/navigation/nav-items";
import { PROFILE_LABELS, type ProfileSection } from "@/features/navigation/profile-sections";
import { NavTab, TeamDivider, type BadgeCounts } from "./nav-tab";

const PROFILE_TAB_ICONS = {
  seller: ACTION_ICONS.resellerTabs.icon,
  supplier: ACTION_ICONS.supplierTabs.icon,
} as const;

/** The menu's items: in admin mode, one profile at a time and then the team's. */
export interface AppNavigation {
  profileItems: readonly NavItem[];
  /** Admin mode only: every profile the admin can open, each one a tab of the menu's switch. */
  profileSections: readonly ProfileSection[];
  teamItems: readonly NavItem[];
}

interface ListProps {
  navigation: AppNavigation;
  /** The profile whose items show; differs from the tab's own while an admin peeks at the other. */
  shownKind: ProfileKind;
  pathname: string;
  counts: BadgeCounts;
  onNavigate?: (() => void) | undefined;
  /** The sidebar shrunk to its icons: headings give way to hairlines. */
  collapsed?: boolean;
  /** Desktop items explain their section on hover. */
  withHint?: boolean;
}

function shownSection(navigation: AppNavigation, shownKind: ProfileKind) {
  const section = navigation.profileSections.find((candidate) => candidate.kind === shownKind);
  return { items: section?.items ?? navigation.profileItems, slug: section?.slug ?? null };
}

/** The one item to light across the whole menu: the longest matching route wins. */
function activeItem(navigation: AppNavigation, shownKind: ProfileKind, pathname: string) {
  const shown = shownSection(navigation, shownKind);
  // Items of a profile peeked at belong to another tab, so none of them is the page open here.
  const profileItems = shown.slug === null ? [...shown.items, ...ACCOUNT_NAV_ITEMS[shownKind]] : [];
  return activeNavItemTo([...profileItems, ...navigation.teamItems], pathname);
}

/** Whether the admin can open both profiles, so the menu offers the switch between them. */
export function hasProfileSwitch(navigation: AppNavigation): boolean {
  return navigation.profileSections.length > 1;
}

/** Revendedor | Fornecedor, when the admin can open both: the list below shows one at a time. */
export function ProfileSwitch({
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
    <SegmentedControl
      legend="Perfil"
      options={sections.map((section) => section.kind)}
      labels={PROFILE_LABELS}
      icons={PROFILE_TAB_ICONS}
      stretch
      value={shownKind}
      onChange={onChange}
    />
  );
}

function GroupHeading({ heading, collapsed }: { heading: string; collapsed: boolean }) {
  if (collapsed) {
    return <TeamDivider vertical={false} />;
  }
  return (
    <h2 className="px-4 pt-3 pb-1 text-caption font-medium text-muted-foreground">{heading}</h2>
  );
}

function ItemGroups({
  items,
  activeTo,
  counts,
  profileSlug,
  onNavigate,
  collapsed,
  withHint,
}: {
  items: readonly NavItem[];
  activeTo: NavItem["to"] | null;
  counts: BadgeCounts;
  profileSlug: string | null;
  onNavigate: (() => void) | undefined;
  collapsed: boolean;
  withHint: boolean;
}) {
  return navGroups(items).map((group) => (
    <div key={group.heading ?? group.items[0]?.to} className="grid gap-1">
      {group.heading === null ? null : (
        <GroupHeading heading={group.heading} collapsed={collapsed} />
      )}
      {group.items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={profileSlug === null && item.to === activeTo}
          // The counters belong to the tab's own profile, not to the one being peeked at.
          count={item.badge && profileSlug === null ? counts[item.badge] : 0}
          profileSlug={profileSlug}
          onNavigate={onNavigate}
          collapsed={collapsed}
          withHint={withHint}
        />
      ))}
    </div>
  ));
}

/** The work items: the shown profile's, then the team's under "Administração". */
export function NavList({
  navigation,
  shownKind,
  pathname,
  counts,
  onNavigate,
  collapsed = false,
  withHint = false,
}: ListProps) {
  const shown = shownSection(navigation, shownKind);
  const activeTo = activeItem(navigation, shownKind, pathname);
  const shared = { activeTo, counts, onNavigate, collapsed, withHint };
  return (
    <>
      <ItemGroups items={shown.items} profileSlug={shown.slug} {...shared} />
      {navigation.teamItems.length === 0 ? null : (
        <>
          <GroupHeading heading="Administração" collapsed={collapsed} />
          <ItemGroups items={navigation.teamItems} profileSlug={null} {...shared} />
        </>
      )}
    </>
  );
}

/** The foot of the menu: support and the account's own pages. */
export function AccountNavList({
  navigation,
  shownKind,
  pathname,
  counts,
  onNavigate,
  collapsed = false,
  withHint = false,
}: ListProps) {
  const shown = shownSection(navigation, shownKind);
  const activeTo = activeItem(navigation, shownKind, pathname);
  return (
    <div className="grid gap-1">
      {ACCOUNT_NAV_ITEMS[shownKind].map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={shown.slug === null && item.to === activeTo}
          count={item.badge && shown.slug === null ? counts[item.badge] : 0}
          profileSlug={shown.slug}
          onNavigate={onNavigate}
          collapsed={collapsed}
          withHint={withHint}
        />
      ))}
    </div>
  );
}
