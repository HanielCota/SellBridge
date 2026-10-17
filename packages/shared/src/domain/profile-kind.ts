/**
 * What a profile (a Better Auth organization) is to its members: a reseller's store or a
 * supplier's catalog. The database column, the sign-up choice and the profile screens read it
 * from here.
 */
export const PROFILE_KINDS = ["seller", "supplier"] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];
