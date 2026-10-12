import { describe, expect, it } from "vitest";
import { assessCustomerHealth, healthLevel, type CustomerSignals } from "./customer-health.ts";

const NOW = new Date("2026-10-11T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

/** A reseller who finished the first steps, sells steadily and signed in today. */
function signals(overrides: Partial<CustomerSignals> = {}): CustomerSignals {
  return {
    banned: false,
    createdAt: daysAgo(60),
    hasRegion: true,
    stores: [{ marketplace: "shopee", shopName: "Loja", status: "connected" }],
    publishedListings: 10,
    failedListings: 0,
    waitingTickets: 0,
    recentOrders: 20,
    previousOrders: 18,
    lastSeenAt: daysAgo(0),
    ...overrides,
  };
}

describe("assessCustomerHealth", () => {
  it("gives a healthy seller full marks and no issues", () => {
    const health = assessCustomerHealth(signals(), NOW);
    expect(health).toMatchObject({
      score: 100,
      level: "healthy",
      issues: [],
      completedSteps: 3,
      nextStep: null,
      stage: "selling",
    });
  });

  it("flags expired or failing stores but not connected ones", () => {
    const stores = [
      { marketplace: "shopee", shopName: "Shopee", status: "expired" },
      { marketplace: "mercado_livre", shopName: "ML", status: "error" },
      { marketplace: "tiktok_shop", shopName: "TikTok", status: "connected" },
    ];
    const health = assessCustomerHealth(signals({ stores }), NOW);
    expect(health.issues).toEqual([{ kind: "store", stores: stores.slice(0, 2) }]);
    expect(health.score).toBe(75);
    expect(health.stage).toBe("at_risk");
  });

  it("orders issues from the most to the least urgent", () => {
    const health = assessCustomerHealth(
      signals({
        stores: [{ marketplace: "shopee", shopName: "Shopee", status: "expired" }],
        failedListings: 3,
        waitingTickets: 1,
        recentOrders: 1,
        previousOrders: 10,
      }),
      NOW,
    );
    expect(health.issues.map((issue) => issue.kind)).toEqual([
      "store",
      "listings",
      "ticket",
      "cooling",
    ]);
    expect(health.score).toBe(30);
    expect(health.level).toBe("critical");
  });

  it("waits out the grace period before calling onboarding stalled", () => {
    const fresh = signals({ createdAt: daysAgo(1), stores: [], publishedListings: 0 });
    const freshHealth = assessCustomerHealth(fresh, NOW);
    expect(freshHealth.issues).toEqual([]);
    expect(freshHealth.stage).toBe("setup");
    expect(freshHealth.nextStep).toBe("store");
    expect(freshHealth.score).toBe(76);

    const stalled = assessCustomerHealth({ ...fresh, createdAt: daysAgo(12) }, NOW);
    expect(stalled.issues).toEqual([
      { kind: "onboarding", nextStep: "store", completedSteps: 1, idleDays: 12 },
    ]);
  });

  it("spots a sales drop only against a busy enough period", () => {
    const quiet = assessCustomerHealth(signals({ previousOrders: 4, recentOrders: 0 }), NOW);
    expect(quiet.issues).toEqual([]);

    const dropped = assessCustomerHealth(signals({ previousOrders: 10, recentOrders: 4 }), NOW);
    expect(dropped.issues).toEqual([{ kind: "cooling", reason: "decline", dropPercent: 60 }]);
    expect(dropped.stage).toBe("cooling");
  });

  it("calls a reseller inactive after a month without signing in", () => {
    const health = assessCustomerHealth(signals({ lastSeenAt: daysAgo(41) }), NOW);
    expect(health.issues).toEqual([{ kind: "cooling", reason: "inactive", idleDays: 41 }]);
    expect(assessCustomerHealth(signals({ lastSeenAt: null }), NOW).issues).toEqual([]);
  });

  it("leaves blocked accounts out of the score", () => {
    const health = assessCustomerHealth(signals({ banned: true, failedListings: 4 }), NOW);
    expect(health).toMatchObject({ score: null, level: null, issues: [], stage: null });
  });
});

describe("healthLevel", () => {
  it("splits the score into three bands", () => {
    expect(healthLevel(70)).toBe("healthy");
    expect(healthLevel(69)).toBe("attention");
    expect(healthLevel(40)).toBe("attention");
    expect(healthLevel(39)).toBe("critical");
  });
});
