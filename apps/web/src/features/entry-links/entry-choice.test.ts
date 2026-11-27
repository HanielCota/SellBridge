import { billingPlan } from "@sellbridge/shared/billing";
import { MAX_BULK_PUBLISH } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { planRoomOf } from "@/features/billing/plan-room";
import {
  blockedReason,
  checkPlan,
  initiallyTicked,
  mercadoLivreStoreIds,
  withTicked,
} from "./entry-choice";

const START = billingPlan("start");

function startRoom(listingsUsed: number) {
  return planRoomOf(
    { kind: "plan", plan: START, source: "subscription" },
    { stores: 2, listings: listingsUsed },
  );
}

describe("initiallyTicked", () => {
  it("ticks only as many products as one batch publishes", () => {
    const products = Array.from({ length: MAX_BULK_PUBLISH + 5 }, (_, index) => ({
      id: `p${index}`,
      published: false,
    }));

    const ticked = initiallyTicked(products);

    expect(ticked.size).toBe(MAX_BULK_PUBLISH);
    expect(ticked.has("p0")).toBe(true);
    expect(ticked.has(`p${MAX_BULK_PUBLISH}`)).toBe(false);
  });

  it("leaves products already listed unticked", () => {
    const ticked = initiallyTicked([
      { id: "listed", published: true },
      { id: "new", published: false },
    ]);

    expect([...ticked]).toEqual(["new"]);
  });
});

describe("mercadoLivreStoreIds", () => {
  it("keeps Mercado Livre and the local mock, leaves Shopee and TikTok out", () => {
    const ids = mercadoLivreStoreIds([
      { id: "ml", marketplace: "mercado_livre" },
      { id: "mock", marketplace: "mock" },
      { id: "shopee", marketplace: "shopee" },
      { id: "tiktok", marketplace: "tiktok_shop" },
    ]);

    expect([...ids]).toEqual(["ml", "mock"]);
  });
});

describe("checkPlan", () => {
  it("counts one listing per product in each store and what is left after", () => {
    expect(checkPlan(startRoom(100), 3, 2)).toEqual({ kind: "fits", listings: 6, leftAfter: 194 });
  });

  it("fits when the choice takes exactly what is left", () => {
    expect(checkPlan(startRoom(294), 3, 2)).toMatchObject({ kind: "fits", leftAfter: 0 });
  });

  it("says how many listings are missing and how many products to untick", () => {
    expect(checkPlan(startRoom(297), 3, 2)).toEqual({
      kind: "short",
      listings: 6,
      short: 3,
      productsToUntick: 2,
    });
  });

  it("asks for a plan when the account has none", () => {
    const room = planRoomOf({ kind: "none" }, { stores: 0, listings: 0 });

    expect(checkPlan(room, 3, 1).kind).toBe("no_plan");
  });

  it("never limits while billing is off", () => {
    expect(checkPlan(planRoomOf(null, { stores: 0, listings: 0 }), 40, 3)).toEqual({
      kind: "unlimited",
      listings: 120,
    });
  });

  it("needs nothing from the plan with no store ticked", () => {
    expect(checkPlan(startRoom(300), 3, 0)).toMatchObject({ kind: "fits", listings: 0 });
  });
});

describe("blockedReason", () => {
  it("lets the review open when the choice fits", () => {
    expect(blockedReason(3, checkPlan(startRoom(0), 3, 1))).toBeNull();
  });

  it("asks for at least one product", () => {
    expect(blockedReason(0, checkPlan(startRoom(0), 0, 1))).toBe("Marque pelo menos um produto.");
  });

  it("asks to untick or change plan when the plan is short", () => {
    expect(blockedReason(3, checkPlan(startRoom(299), 3, 1))).toContain("Desmarque produtos");
  });

  it("asks for a plan when there is none", () => {
    const room = planRoomOf({ kind: "none" }, { stores: 0, listings: 0 });

    expect(blockedReason(1, checkPlan(room, 1, 1))).toContain("Escolha um plano");
  });
});

describe("withTicked", () => {
  it("adds a ticked product once", () => {
    expect([...withTicked(new Set(["a"]), "a", true)]).toEqual(["a"]);
  });

  it("removes an unticked product and keeps the others", () => {
    expect([...withTicked(new Set(["a", "b"]), "a", false)]).toEqual(["b"]);
  });
});
