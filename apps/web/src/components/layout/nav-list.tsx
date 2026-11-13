import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Fragment, type ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { SegmentedControl } from "@/components/data/segmented-control";
import {
  ACCOUNT_NAV_ITEMS,
  activeNavItemTo,
  navGroups,
  SUPPORT_NAV_ITEM,
  type NavGroup,
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

/** What both lists show, worked out once per menu so they always light the same item. */
export interface ShownMenu {
  /** The profile whose items show; differs from the tab's own while an admin peeks at the other. */
  kind: ProfileKind;
  items: readonly NavItem[];
  /** The profile its links open (`?perfil=`); null keeps the tab's own. */
  slug: string | null;
  activeTo: NavItem["to"] | null;
}

interface ListProps {
  navigation: AppNavigation;
  shown: ShownMenu;
  counts: BadgeCounts;
  onNavigate?: (() => void) | undefined;
  /** The sidebar shrunk to its icons: headings give way to hairlines. */
  collapsed?: boolean;
  /** The team's pages under "Administração"; the desktop shows them in the header instead. */
  withTeam?: boolean;
  /** Desktop items explain their section on hover. */
  withHint?: boolean;
}

/**
 * The shown profile's items and the one item to light across the whole menu (the longest
 * matching route wins), for the work list and the foot alike.
 */
export function shownMenu(
  navigation: AppNavigation,
  kind: ProfileKind,
  pathname: string,
): ShownMenu {
  const section = navigation.profileSections.find((candidate) => candidate.kind === kind);
  const items = section?.items ?? navigation.profileItems;
  const slug = section?.slug ?? null;
  // Items of a profile peeked at belong to another tab, so none of them is the page open here.
  const profileItems = slug === null ? [...items, ...ACCOUNT_NAV_ITEMS[kind]] : [];
  const activeTo = activeNavItemTo([...profileItems, ...navigation.teamItems], pathname);
  return { kind, items, slug, activeTo };
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

/** The one written heading in the menu, over the team's pages. */
function TeamHeading() {
  return (
    <h2 className="px-4 pt-3 pb-1 text-caption font-medium text-muted-foreground">Administração</h2>
  );
}

/**
 * A line sets a named group apart from the items before it. The list's first group has none
 * (under "Administração" it read as an underline), except shrunk, where that line is all that
 * sets the team's icons apart.
 */
function hasLineAbove(group: NavGroup, index: number, collapsed: boolean): boolean {
  if (group.heading === null) {
    return false;
  }
  return index > 0 || collapsed;
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
  // A heading can come back later in the list, so the key carries the group's position too.
  // Groups are set apart by a line: the written names cluttered the menu, and screen readers
  // still hear each one through the group's label.
  return navGroups(items).map((group, index) => (
    <div
      key={`${index}-${group.heading ?? ""}`}
      role={group.heading === null ? undefined : "group"}
      aria-label={group.heading ?? undefined}
      className="grid grid-cols-1 gap-1"
    >
      {hasLineAbove(group, index, collapsed) ? <TeamDivider vertical={false} /> : null}
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
  shown,
  counts,
  onNavigate,
  collapsed = false,
  withHint = false,
  withTeam = true,
}: ListProps) {
  const shared = { activeTo: shown.activeTo, counts, onNavigate, collapsed, withHint };
  return (
    <>
      <ItemGroups items={shown.items} profileSlug={shown.slug} {...shared} />
      {withTeam && navigation.teamItems.length > 0 ? (
        <>
          {/* Shrunk, the first team group's hairline already sets the team apart. */}
          {collapsed ? null : <TeamHeading />}
          <ItemGroups items={navigation.teamItems} profileSlug={null} {...shared} />
        </>
      ) : null}
    </>
  );
}

/**
 * The foot of the menu: support and the account's own pages. `supportPanel` stands in for the
 * support link where support opens as a card (the sidebar).
 */
export function AccountNavList({
  shown,
  counts,
  onNavigate,
  collapsed = false,
  withHint = false,
  supportPanel = null,
}: Omit<ListProps, "navigation"> & { supportPanel?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      {ACCOUNT_NAV_ITEMS[shown.kind].map((item) =>
        item.to === SUPPORT_NAV_ITEM.to && supportPanel !== null ? (
          <Fragment key={item.to}>{supportPanel}</Fragment>
        ) : (
          <NavTab
            key={item.to}
            item={item}
            isActive={shown.slug === null && item.to === shown.activeTo}
            count={item.badge && shown.slug === null ? counts[item.badge] : 0}
            profileSlug={shown.slug}
            onNavigate={onNavigate}
            collapsed={collapsed}
            withHint={withHint}
          />
        ),
      )}
    </div>
  );
}
