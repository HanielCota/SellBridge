import { describe, expect, it } from "vitest";
import { NAV_ITEMS, SUPPLIER_NAV_ITEMS } from "./nav-items";
import { adminProfileSections, isCurrentSection } from "./profile-sections";

describe("adminProfileSections", () => {
  it("shows only the tab's own profile when the account has no other kind", () => {
    const sections = adminProfileSections("seller", [{ slug: "loja-a", kind: "seller" }]);
    expect(sections).toEqual([
      { label: "Revendedor", kind: "seller", slug: null, items: NAV_ITEMS },
    ]);
  });

  it("adds the account's oldest supplier profile after the seller tabs", () => {
    const sections = adminProfileSections("seller", [
      { slug: "loja-a", kind: "seller" },
      { slug: "marca-a", kind: "supplier" },
      { slug: "marca-b", kind: "supplier" },
    ]);
    expect(sections).toEqual([
      { label: "Revendedor", kind: "seller", slug: null, items: NAV_ITEMS },
      { label: "Fornecedor", kind: "supplier", slug: "marca-a", items: SUPPLIER_NAV_ITEMS },
    ]);
  });

  it("keeps the reseller section first when the tab is on the supplier profile", () => {
    const sections = adminProfileSections("supplier", [
      { slug: "loja-a", kind: "seller" },
      { slug: "marca-a", kind: "supplier" },
    ]);
    expect(sections.map((section) => [section.label, section.slug])).toEqual([
      ["Revendedor", "loja-a"],
      ["Fornecedor", null],
    ]);
  });

  it("marks only the tab's own profile as current", () => {
    const sections = adminProfileSections("supplier", [{ slug: "loja-a", kind: "seller" }]);
    expect(sections.map(isCurrentSection)).toEqual([false, true]);
  });
});
