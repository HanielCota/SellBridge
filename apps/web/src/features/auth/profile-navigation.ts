export interface ProfileNavigationInput {
  /** `?perfil=` of the page being opened. */
  searchProfile: string | undefined;
  /** The profile the server resolved for this page, or null for an account with none. */
  sessionProfile: string | null;
  /** The slug the page asked for when it is not one of the account's profiles. */
  foreignProfile: string | null;
  /** The profile this tab was on before this navigation. */
  rememberedProfile: string | null;
  /** A SellBridge team page (/admin): it belongs to no profile. */
  isTeamPage: boolean;
}

export type ProfileNavigation =
  | { kind: "add_profile"; slug: string }
  | { kind: "foreign_profile" }
  | { kind: "drop_profile" }
  | { kind: "stay"; clearCache: boolean };

/**
 * What the app layout does with the profile of a page: every page carries its profile in the URL
 * (so a reload or a copied link opens the same one), a profile outside the account gets its own
 * screen instead of an error, and moving the tab to another profile drops the data cached for
 * the previous one.
 */
export function planProfileNavigation(input: ProfileNavigationInput): ProfileNavigation {
  if (input.foreignProfile !== null && input.isTeamPage) {
    // A colleague's link to a ticket carries their profile; the page itself needs none.
    return { kind: "drop_profile" };
  }
  if (input.foreignProfile !== null) {
    return { kind: "foreign_profile" };
  }
  if (input.sessionProfile === null) {
    return { kind: "stay", clearCache: false };
  }
  if (input.searchProfile !== input.sessionProfile) {
    return { kind: "add_profile", slug: input.sessionProfile };
  }
  const movedProfile =
    input.rememberedProfile !== null && input.rememberedProfile !== input.sessionProfile;
  return { kind: "stay", clearCache: movedProfile };
}
