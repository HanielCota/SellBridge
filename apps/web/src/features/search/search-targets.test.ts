import { describe, expect, it } from "vitest";
import { searchResultHref } from "./search-targets";

describe("global search destinations", () => {
  it("opens the selected order directly in its operations page", () => {
    const order = { id: "e85e1e63-343b-4c1a-a13a-d84fce904c8a", externalOrderId: "ORDER-1" };
    expect(searchResultHref.order(order)).toBe("/pedidos/e85e1e63-343b-4c1a-a13a-d84fce904c8a");
  });

  it("keeps publication search text encoded in a single query parameter", () => {
    const href = searchResultHref.listing({ title: "Product & price?" });
    expect(new URL(href, "https://example.test").searchParams.get("query")).toBe(
      "Product & price?",
    );
  });
});
