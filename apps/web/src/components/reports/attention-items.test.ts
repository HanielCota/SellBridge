import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./attention-items";

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

  it("sends a connected store with nothing to sell to its supplier's catalog", () => {
    const idle = {
      id: "s1",
      name: "Loja Centro",
      status: "connected",
      liveListings: 0,
      failedListings: 0,
      publishingListings: 0,
    };
    const [item] = buildAttentionItems(quiet, [idle], null);
    expect(item).toMatchObject({
      key: "idle-store-s1",
      title: "Escolha produtos para Loja Centro",
      to: "/catalogo",
      search: { store: "s1" },
    });
  });

  it("leaves out the catalog shortcut for stores that sell, fail or are disconnected", () => {
    const base = { name: "Loja", liveListings: 0, failedListings: 0, publishingListings: 0 };
    const stores = [
      { ...base, id: "selling", status: "connected", liveListings: 3 },
      { ...base, id: "failing", status: "connected", failedListings: 1 },
      { ...base, id: "paused", status: "paused" },
    ];
    const items = buildAttentionItems(quiet, stores, null);
    expect(items.some((item) => item.key.startsWith("idle-store"))).toBe(false);
  });

  // Regression: right after a bulk publication the store's listings are still queued, so it was
  // told to choose products it had just chosen.
  it("leaves out the catalog shortcut while the store's first listings are on their way", () => {
    const publishing = {
      id: "s1",
      name: "Loja Centro",
      status: "connected",
      liveListings: 0,
      failedListings: 0,
      publishingListings: 2,
    };
    expect(buildAttentionItems(quiet, [publishing], null)).toEqual([]);
  });
});
