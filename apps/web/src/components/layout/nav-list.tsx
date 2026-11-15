import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Fragment, type ReactNode, useId } from "react";
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

/** Over the team's pages (phone sheet only): a line and a title, above their own group names. */
function TeamHeading() {
  return (
    <>
      <TeamDivider vertical={false} />
      <h2 className="px-4 pt-2 text-sm font-semibold text-foreground">Administração</h2>
    </>
  );
}

/** A group's name, small and soft above its items, so the list reads in parts at a glance. */
function GroupLabel({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="px-4 pt-3 pb-1 text-caption font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function ItemGroup({
  group,
  activeTo,
  counts,
  profileSlug,
  onNavigate,
  withHint,
}: {
  group: NavGroup;
  activeTo: NavItem["to"] | null;
  counts: BadgeCounts;
  profileSlug: string | null;
  onNavigate: (() => void) | undefined;
  withHint: boolean;
}) {
  const labelId = useId();
  const hasLabel = group.heading !== null;
  return (
    <div
      role={hasLabel ? "group" : undefined}
      aria-labelledby={hasLabel ? labelId : undefined}
      className="grid grid-cols-1 gap-1"
    >
      {group.heading === null ? null : <GroupLabel id={labelId}>{group.heading}</GroupLabel>}
      {group.items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={profileSlug === null && item.to === activeTo}
          // The counters belong to the tab's own profile, not to the one being peeked at.
          count={item.badge && profileSlug === null ? counts[item.badge] : 0}
          profileSlug={profileSlug}
          onNavigate={onNavigate}
          withHint={withHint}
        />
      ))}
    </div>
  );
}

function ItemGroups({
  items,
  ...shared
}: {
  items: readonly NavItem[];
  activeTo: NavItem["to"] | null;
  counts: BadgeCounts;
  profileSlug: string | null;
  onNavigate: (() => void) | undefined;
  withHint: boolean;
}) {
  // A heading can come back later in the list, so the key carries the group's position too.
  return navGroups(items).map((group, index) => (
    <ItemGroup key={`${index}-${group.heading ?? ""}`} group={group} {...shared} />
  ));
}

/** The work items: the shown profile's, then the team's under "Administração". */
export function NavList({
  navigation,
  shown,
  counts,
  onNavigate,
  withHint = false,
  withTeam = true,
}: ListProps) {
  const shared = { activeTo: shown.activeTo, counts, onNavigate, withHint };
  return (
    <>
      <ItemGroups items={shown.items} profileSlug={shown.slug} {...shared} />
      {withTeam && navigation.teamItems.length > 0 ? (
        <>
          <TeamHeading />
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
            withHint={withHint}
          />
        ),
      )}
    </div>
  );
}
