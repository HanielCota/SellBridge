import { describe, expect, it } from "vitest";
import { PAGE_COMMANDS } from "./command-pages";

// MVP: the search no longer offers the seller's own-product page.
describe("command palette pages", () => {
  it("offers no shortcut to the seller's own products", () => {
    expect(PAGE_COMMANDS.some((page) => page.to === "/products")).toBe(false);
    expect(PAGE_COMMANDS.some((page) => page.keywords.includes("próprios"))).toBe(false);
  });
});
