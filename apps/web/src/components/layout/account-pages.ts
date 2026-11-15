import type { ProfileKind } from "@sellbridge/shared/profile-kind";

/** The profile card's menu, in the order it lists them; signing out always comes last. */
export const ACCOUNT_MENU_ENTRIES = [
  "profile",
  "sellerData",
  "teamMode",
  "theme",
  "signOut",
] as const;
export type AccountMenuEntry = (typeof ACCOUNT_MENU_ENTRIES)[number];

/**
 * The menu for this account: the registration is the reseller's (a supplier's company data sits
 * on its Marca page, and `profileRedirectFor` sends it away from /onboarding), and only the team
 * gets the switch of its mode.
 */
export function accountMenuEntries({
  profileKind,
  isStaff,
}: {
  profileKind: ProfileKind;
  isStaff: boolean;
}): readonly AccountMenuEntry[] {
  return ACCOUNT_MENU_ENTRIES.filter((entry) => {
    if (entry === "sellerData") {
      return profileKind === "seller";
    }
    if (entry === "teamMode") {
      return isStaff;
    }
    return true;
  });
}
