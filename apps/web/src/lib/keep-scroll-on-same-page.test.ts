import { describe, expect, it } from "vitest";
import { keepScrollOnSamePage } from "./keep-scroll-on-same-page";

describe("keepScrollOnSamePage", () => {
  it("keeps the scroll when only the search of the page changes", () => {
    const next = { pathname: "/dashboard", search: { period: "30d" } };

    const commit = keepScrollOnSamePage(next, "/dashboard");

    expect(commit).toEqual({ ...next, resetScroll: false });
  });

  it("leaves the reset to the router when the navigation opens another page", () => {
    const next: { pathname: string; resetScroll?: boolean } = { pathname: "/pedidos" };

    const commit = keepScrollOnSamePage(next, "/dashboard");

    expect(commit.resetScroll).toBeUndefined();
  });

  it("keeps the choice of a navigation that sets resetScroll itself", () => {
    const next = { pathname: "/catalogo", resetScroll: true };

    const commit = keepScrollOnSamePage(next, "/catalogo");

    expect(commit.resetScroll).toBe(true);
  });
});
