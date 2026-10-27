import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { NAV_ITEMS, SUPPLIER_NAV_ITEMS, type NavItem } from "./nav-items";

/** A profile's tabs as one menu of the admin header (and one tab of the phone sheet). */
export interface ProfileSection {
  label: string;
  kind: ProfileKind;
  /** The profile its links open (`?perfil=`); null keeps the tab's own profile. */
  slug: string | null;
  items: readonly NavItem[];
}

export const PROFILE_LABELS: Readonly<Record<ProfileKind, string>> = {
  seller: "Revendedor",
  supplier: "Fornecedor",
};

const PROFILE_TABS: Readonly<Record<ProfileKind, readonly NavItem[]>> = {
  seller: NAV_ITEMS,
  supplier: SUPPLIER_NAV_ITEMS,
};

/** Reseller first, then supplier, whichever the tab is on: the menus never swap places. */
const PROFILE_ORDER: readonly ProfileKind[] = ["seller", "supplier"];

function sectionOf(kind: ProfileKind, slug: string | null): ProfileSection {
  return { label: PROFILE_LABELS[kind], kind, slug, items: PROFILE_TABS[kind] };
}

/**
 * One section per profile kind the admin can open: the tab's own profile, plus the account's
 * oldest profile of the other kind, so the supplier panel (or the seller screens) is one click
 * away without leaving admin mode.
 */
export function adminProfileSections(
  currentKind: ProfileKind,
  profiles: readonly { slug: string; kind: ProfileKind }[],
): ProfileSection[] {
  return PROFILE_ORDER.flatMap((kind) => {
    if (kind === currentKind) {
      return [sectionOf(kind, null)];
    }
    const profile = profiles.find((candidate) => candidate.kind === kind);
    if (profile === undefined) {
      return [];
    }
    return [sectionOf(kind, profile.slug)];
  });
}

/** The section the tab is on: its links keep the tab's profile. */
export function isCurrentSection(section: ProfileSection): boolean {
  return section.slug === null;
}
