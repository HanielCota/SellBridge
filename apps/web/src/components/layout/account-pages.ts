import type { ProfileKind } from "@sellbridge/shared/profile-kind";

/** The pages the account menu links to, in the order it lists them. */
export const ACCOUNT_PAGES = [
  "profile",
  "sellerData",
  "billing",
  "integrations",
  "support",
] as const;
export type AccountPage = (typeof ACCOUNT_PAGES)[number];

/**
 * The reseller's registration, plan and marketplace connections: a supplier has none of them and
 * `profileRedirectFor` sends it back to its panel, so its menu does not offer them.
 */
const SELLER_ONLY_PAGES: ReadonlySet<AccountPage> = new Set([
  "sellerData",
  "billing",
  "integrations",
]);

export function accountPagesFor(profileKind: ProfileKind): readonly AccountPage[] {
  if (profileKind === "seller") {
    return ACCOUNT_PAGES;
  }
  return ACCOUNT_PAGES.filter((page) => !SELLER_ONLY_PAGES.has(page));
}
