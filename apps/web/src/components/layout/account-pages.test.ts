import { describe, expect, it } from "vitest";
import { accountMenuEntries } from "./account-pages";

describe("accountMenuEntries", () => {
  it("lists the profile, the registration, the theme and signing out for a reseller", () => {
    expect(accountMenuEntries({ profileKind: "seller", isStaff: false })).toEqual([
      "profile",
      "sellerData",
      "theme",
      "signOut",
    ]);
  });

  it("adds the team mode switch before the theme for the team", () => {
    expect(accountMenuEntries({ profileKind: "seller", isStaff: true })).toEqual([
      "profile",
      "sellerData",
      "teamMode",
      "theme",
      "signOut",
    ]);
  });

  it("leaves the reseller's registration out of a supplier's menu", () => {
    expect(accountMenuEntries({ profileKind: "supplier", isStaff: false })).toEqual([
      "profile",
      "theme",
      "signOut",
    ]);
  });
});
