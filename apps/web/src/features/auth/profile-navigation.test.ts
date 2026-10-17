import { describe, expect, it } from "vitest";
import { planProfileNavigation } from "./profile-navigation";

describe("planProfileNavigation", () => {
  it("adds the profile to a URL that has none, so a reload or copied link keeps it", () => {
    expect(
      planProfileNavigation({
        searchProfile: undefined,
        sessionProfile: "loja-a",
        foreignProfile: null,
        rememberedProfile: null,
      }),
    ).toEqual({ kind: "add_profile", slug: "loja-a" });
  });

  it("sends a profile outside the account to the other-profile screen", () => {
    expect(
      planProfileNavigation({
        searchProfile: "loja-de-outra-pessoa",
        sessionProfile: null,
        foreignProfile: "loja-de-outra-pessoa",
        rememberedProfile: "loja-a",
      }),
    ).toEqual({ kind: "foreign_profile" });
  });

  it("clears the previous profile's data when the tab moves to another profile", () => {
    expect(
      planProfileNavigation({
        searchProfile: "loja-b",
        sessionProfile: "loja-b",
        foreignProfile: null,
        rememberedProfile: "loja-a",
      }),
    ).toEqual({ kind: "stay", clearCache: true });
  });

  it("keeps the cached data while the tab stays on its profile", () => {
    expect(
      planProfileNavigation({
        searchProfile: "loja-a",
        sessionProfile: "loja-a",
        foreignProfile: null,
        rememberedProfile: "loja-a",
      }),
    ).toEqual({ kind: "stay", clearCache: false });
  });

  it("leaves an account without any profile where it is", () => {
    expect(
      planProfileNavigation({
        searchProfile: undefined,
        sessionProfile: null,
        foreignProfile: null,
        rememberedProfile: null,
      }),
    ).toEqual({ kind: "stay", clearCache: false });
  });
});
