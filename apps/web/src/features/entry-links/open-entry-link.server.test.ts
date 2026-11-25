import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimDeveloperEntryLink: vi.fn<() => Promise<unknown>>(),
  getSellableProducts: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { openEntryLinkFor } = await import("./open-entry-link.server");

const NOW = new Date("2026-11-25T12:00:00Z");
const SECRET = "a".repeat(43);
const RESELLER = { userId: "user-1", tenantId: "tenant-1", role: "user", impersonatedBy: null };
const SUPPLIER_ID = "supplier-1";

function sellable(id: string, supplierId = SUPPLIER_ID) {
  return {
    id,
    title: `Produto ${id}`,
    imageUrl: null,
    costCents: 1990,
    supplierId,
    supplierName: "Ateliê Teste",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claimDeveloperEntryLink.mockResolvedValue({
    kind: "claimed",
    link: { id: "link-1", supplierId: SUPPLIER_ID, productIds: ["p1", "p2"] },
  });
  mocks.getSellableProducts.mockResolvedValue([sellable("p1"), sellable("p2")]);
});

describe("openEntryLinkFor", () => {
  it("shows the chosen products with the supplier's name", async () => {
    const view = await openEntryLinkFor(RESELLER, SECRET, NOW);

    expect(view).toMatchObject({
      kind: "ready",
      supplierName: "Ateliê Teste",
      products: [{ id: "p1" }, { id: "p2" }],
      unavailableCount: 0,
    });
  });

  it("counts the chosen products no longer offered", async () => {
    mocks.getSellableProducts.mockResolvedValue([sellable("p1")]);

    const view = await openEntryLinkFor(RESELLER, SECRET, NOW);

    expect(view).toMatchObject({ kind: "ready", unavailableCount: 1 });
  });

  it("says the products are gone when none is offered anymore", async () => {
    mocks.getSellableProducts.mockResolvedValue([]);

    const view = await openEntryLinkFor(RESELLER, SECRET, NOW);

    expect(view).toEqual({ kind: "unavailable" });
  });

  it("never claims the link while the team is inside the customer's account", async () => {
    const view = await openEntryLinkFor({ ...RESELLER, impersonatedBy: "admin-1" }, SECRET, NOW);

    expect(view).toEqual({ kind: "team_visit" });
    expect(mocks.claimDeveloperEntryLink).not.toHaveBeenCalled();
  });

  it("treats a malformed choice secret as an invalid link without looking it up", async () => {
    const view = await openEntryLinkFor(RESELLER, "../../dashboard", NOW);

    expect(view).toEqual({ kind: "invalid" });
    expect(mocks.claimDeveloperEntryLink).not.toHaveBeenCalled();
  });

  it("never claims the choice for a team account", async () => {
    const view = await openEntryLinkFor({ ...RESELLER, role: "admin" }, SECRET, NOW);

    expect(view).toEqual({ kind: "staff_account" });
    expect(mocks.claimDeveloperEntryLink).not.toHaveBeenCalled();
  });

  it("treats a browser without the choice cookie as an invalid link", async () => {
    const view = await openEntryLinkFor(RESELLER, undefined, NOW);

    expect(view).toEqual({ kind: "invalid" });
  });

  it.each([
    ["not_found", "invalid"],
    ["expired", "expired"],
    ["used", "used"],
  ])("turns a %s claim into the %s screen", async (claim, screen) => {
    mocks.claimDeveloperEntryLink.mockResolvedValue({ kind: claim });

    const view = await openEntryLinkFor(RESELLER, SECRET, NOW);

    expect(view).toEqual({ kind: screen });
  });
});
