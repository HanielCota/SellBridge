import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./attention-panel";

const quiet = { failedListings: 0, unreadSupportReplies: 0, pendingReviews: 0 };

describe("attention panel", () => {
  // Regression: "pedidos para avaliar" led to /pedidos on the operations tab, so the orders it
  // counted were nowhere to be seen.
  it("opens the orders page on the reviews tab, filtered to the pending ones", () => {
    const [reviews] = buildAttentionItems({ ...quiet, pendingReviews: 2 }, [], null);
    expect(reviews).toMatchObject({
      key: "reviews",
      to: "/pedidos",
      search: { view: "reviews", review: "pending" },
    });
  });

  it("keeps the other items free of any search", () => {
    const items = buildAttentionItems({ ...quiet, failedListings: 1 }, [], null);
    expect(items[0]).toMatchObject({ key: "listings", to: "/publicacoes" });
    expect(items[0]?.search).toBeUndefined();
  });
});
