import { describe, expect, it } from "vitest";
import { supplierReviewInputSchema } from "../schemas/reviews.ts";
import {
  canReviewOrder,
  compareReputation,
  computeSupplierReputation,
  emptyReputationStats,
  scoreLevel,
  type SupplierReputationStats,
} from "./supplier-score.ts";

function stats(overrides: Partial<SupplierReputationStats>): SupplierReputationStats {
  return { ...emptyReputationStats(), ...overrides };
}

/** `count` reviews averaging `average` stars, all positive. */
function reviewed(count: number, average: number): Partial<SupplierReputationStats> {
  return { reviewCount: count, ratingSum: count * average, positiveCount: count };
}

describe("computeSupplierReputation", () => {
  it("keeps a supplier with few reviews unscored", () => {
    const reputation = computeSupplierReputation(stats(reviewed(9, 5)));
    expect(reputation.score).toBeNull();
    expect(reputation.level).toBeNull();
    expect(reputation.average).toBe(5);
    expect(reputation.highlighted).toBe(false);
  });

  it("scores on reviews alone when there are no finished orders", () => {
    const reputation = computeSupplierReputation(stats(reviewed(45, 5)));
    // (3.5 × 5 + 225) / 50 = 4.85 stars → 96.25 points.
    expect(reputation.score).toBe(96);
    expect(reputation.level).toBe("excellent");
  });

  it("ranks many good reviews above a few perfect ones", () => {
    const few = computeSupplierReputation(stats(reviewed(10, 5)));
    const many = computeSupplierReputation(stats(reviewed(300, 4.8)));
    expect(many.score).toBeGreaterThan(few.score ?? 0);
  });

  it("keeps the level in line with the stars when the orders are within their limits", () => {
    const orders = { orderCount: 100, cancelledCount: 1, returnedCount: 1 };
    const praised = computeSupplierReputation(stats({ ...reviewed(17, 4.8), ...orders }));
    const middling = computeSupplierReputation(stats({ ...reviewed(30, 3.1), ...orders }));
    // (3.5 × 5 + 81.6) / 22 ≈ 4.5 stars → 88 points, untouched by the clean orders.
    expect(praised.score).toBe(88);
    expect(praised.level).toBe("good");
    expect(middling.level).toBe("attention");
  });

  it("pulls the score down when returns and cancellations pass their limits", () => {
    const clean = computeSupplierReputation(
      stats({ ...reviewed(40, 4.8), orderCount: 100, cancelledCount: 1, returnedCount: 1 }),
    );
    const troubled = computeSupplierReputation(
      stats({ ...reviewed(40, 4.8), orderCount: 100, cancelledCount: 8, returnedCount: 9 }),
    );
    expect(clean.metrics.every((metric) => metric.withinLimit)).toBe(true);
    expect(troubled.metrics.every((metric) => metric.withinLimit)).toBe(false);
    expect(troubled.score).toBeLessThan(clean.score ?? 0);
    expect(clean.score).toBe(Math.round(((4.8 * 40 + 3.5 * 5) / 45 - 1) * 25));
  });

  it("weighs failures in a handful of orders less than the same rate in many", () => {
    const base = reviewed(40, 4.8);
    const few = computeSupplierReputation(
      stats({ ...base, orderCount: 15, cancelledCount: 2, returnedCount: 1 }),
    );
    const many = computeSupplierReputation(
      stats({ ...base, orderCount: 150, cancelledCount: 20, returnedCount: 10 }),
    );
    expect(few.score).toBeGreaterThan(many.score ?? 100);
  });

  it("highlights only excellent suppliers with enough orders", () => {
    const base = { ...reviewed(60, 4.9), cancelledCount: 0, returnedCount: 0 };
    expect(computeSupplierReputation(stats({ ...base, orderCount: 40 })).highlighted).toBe(true);
    expect(computeSupplierReputation(stats({ ...base, orderCount: 10 })).highlighted).toBe(false);
    const troubled = stats({ ...base, orderCount: 40, cancelledCount: 4 });
    expect(computeSupplierReputation(troubled).highlighted).toBe(false);
  });

  it("shows an aspect only after enough mentions", () => {
    const reputation = computeSupplierReputation(
      stats({
        ...reviewed(20, 4),
        aspects: {
          ...emptyReputationStats().aspects,
          dispatch: { good: 9, bad: 1 },
          support: { good: 1, bad: 1 },
        },
      }),
    );
    const byAspect = new Map(reputation.aspects.map((aspect) => [aspect.aspect, aspect.share]));
    expect(byAspect.get("dispatch")).toBe(0.9);
    expect(byAspect.get("support")).toBeNull();
  });

  it("splits reviews into positive, neutral and negative", () => {
    const reputation = computeSupplierReputation(
      stats({
        reviewCount: 10,
        ratingSum: 38,
        positiveCount: 8,
        neutralCount: 1,
        negativeCount: 1,
      }),
    );
    expect(reputation.sentiment).toEqual({ positive: 0.8, neutral: 0.1, negative: 0.1 });
  });
});

describe("scoreLevel", () => {
  it.each([
    [95, "excellent"],
    [90, "excellent"],
    [89, "good"],
    [60, "regular"],
    [40, "attention"],
    [39, "critical"],
  ] as const)("%i is %s", (score, level) => {
    expect(scoreLevel(score)).toBe(level);
  });
});

function delivered(orderedAt: Date, deliveredAt: Date | null) {
  return { status: "delivered", orderedAt, deliveredAt };
}

describe("canReviewOrder", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("allows delivered orders inside the window", () => {
    const orderedAt = new Date("2026-09-01T12:00:00Z");
    expect(canReviewOrder(delivered(orderedAt, orderedAt), now)).toBe(true);
  });

  it("refuses orders not delivered or too old", () => {
    const shipped = { status: "shipped", orderedAt: now, deliveredAt: null };
    expect(canReviewOrder(shipped, now)).toBe(false);
    const old = new Date("2026-07-01T12:00:00Z");
    expect(canReviewOrder(delivered(old, old), now)).toBe(false);
  });

  it("counts the window from the delivery, not the order", () => {
    const orderedAt = new Date("2026-07-01T12:00:00Z");
    expect(canReviewOrder(delivered(orderedAt, new Date("2026-09-20T12:00:00Z")), now)).toBe(true);
    expect(canReviewOrder(delivered(orderedAt, null), now)).toBe(false);
  });
});

describe("compareReputation", () => {
  it("puts scored suppliers first, best score first", () => {
    const unscored = computeSupplierReputation(stats(reviewed(3, 5)));
    const good = computeSupplierReputation(stats(reviewed(40, 4.2)));
    const great = computeSupplierReputation(stats(reviewed(40, 4.9)));
    const sorted = [unscored, good, great].toSorted(compareReputation);
    expect(sorted).toEqual([great, good, unscored]);
  });
});

describe("supplierReviewInputSchema", () => {
  const ids = {
    orderId: "4f0c8a1e-8a3e-4c55-9f1e-2d7c1a3b5e60",
    supplierId: "8b2d6f4a-1c3e-4a5b-8d7f-9e0a1b2c3d4e",
  };

  it("accepts praise tags with a good rating and trims the comment", () => {
    const review = supplierReviewInputSchema.parse({
      ...ids,
      rating: 5,
      tags: ["dispatch:good", "dispatch:good"],
      comment: "  Chegou rápido  ",
    });
    expect(review.tags).toEqual(["dispatch:good"]);
    expect(review.comment).toBe("Chegou rápido");
  });

  it("refuses complaint tags on a good rating", () => {
    const result = supplierReviewInputSchema.safeParse({
      ...ids,
      rating: 5,
      tags: ["packaging:bad"],
      comment: "",
    });
    expect(result.success).toBe(false);
  });
});
