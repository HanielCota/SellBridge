import { describe, expect, it } from "vitest";
import { accountPagesFor } from "./account-pages";

describe("accountPagesFor", () => {
  it("keeps every account page for a reseller", () => {
    expect(accountPagesFor("seller")).toEqual([
      "profile",
      "sellerData",
      "billing",
      "integrations",
      "support",
    ]);
  });

  it("leaves the reseller's registration, plan and integrations out of a supplier's menu", () => {
    expect(accountPagesFor("supplier")).toEqual(["profile", "support"]);
  });
});
