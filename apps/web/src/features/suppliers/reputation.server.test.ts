import { emptyReputationStats } from "@sellbridge/shared/supplier-score";
import { describe, expect, it, vi } from "vitest";

const SECRET_COMMENT = "Atrasou por culpa da transportadora";
const supplierId = "0f6a8f4e-5d0b-4c47-9e57-3f0c3b2a1d10";
const commentedReview = { id: "r1", rating: 2, tags: [], comment: SECRET_COMMENT };

vi.mock("@/lib/server/database", () => ({ database: {} }));
// Every review reader still answers with a comment, to prove the reseller answer reads none.
vi.mock("@sellbridge/database/repositories", () => ({
  getDirectorySupplier: async () => ({ id: supplierId }),
  getSupplierReputationStats: async () =>
    new Map([[supplierId, { ...emptyReputationStats(), reviewCount: 1, ratingSum: 2 }]]),
  listSupplierReviewsForModeration: async () => ({ items: [commentedReview] }),
}));

const { loadSupplierReputation } = await import("./reputation.server");

describe("loadSupplierReputation", () => {
  it("answers resellers with the score and never with a review comment", async () => {
    const answer = await loadSupplierReputation(supplierId);
    const json = JSON.stringify(answer);
    expect(answer.reputation.reviewCount).toBe(1);
    expect(json).not.toContain(SECRET_COMMENT);
    expect(json).not.toContain('"comment"');
  });
});
