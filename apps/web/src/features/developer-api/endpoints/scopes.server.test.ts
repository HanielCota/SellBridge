import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: { DEVELOPER_EMAILS: [] } }));
vi.mock("@/lib/server/marketplaces", () => ({ tokenCipher: {} }));

const organizations = await import("./organizations.server");
const reads = await import("./organization-reads.server");
const orders = await import("./orders.server");
const suppliers = await import("./suppliers.server");
const tickets = await import("./tickets.server");

describe("developer endpoint scopes", () => {
  it.each([
    [organizations.listDeveloperOrganizations, "organizations:read"],
    [organizations.getDeveloperOrganization, "organizations:read"],
    [reads.listDeveloperStores, "stores:read"],
    [reads.listDeveloperListings, "listings:read"],
    [reads.getDeveloperListing, "listings:read"],
    [reads.listDeveloperOrders, "orders:read"],
    [orders.getDeveloperOrder, "orders:read"],
    [reads.getDeveloperFinancialSummary, "financials:read"],
    [reads.listDeveloperCatalogProducts, "catalog:read"],
    [reads.getDeveloperCatalogProduct, "catalog:read"],
    [suppliers.listDeveloperSuppliers, "suppliers:read"],
    [suppliers.listDeveloperSupplierProducts, "suppliers:read"],
    [tickets.listDeveloperTickets, "support:read"],
    [tickets.getDeveloperTicket, "support:read"],
  ])("%# asks for the scope of the data it returns", (endpoint, scope) => {
    const declared = endpoint.scope;

    expect(declared).toBe(scope);
  });

  it("never lets the buyer's personal-data option open an endpoint alone", () => {
    const endpoints = [
      ...Object.values(organizations),
      ...Object.values(reads),
      ...Object.values(orders),
      ...Object.values(suppliers),
      ...Object.values(tickets),
    ];

    const opened = endpoints.filter((endpoint) => endpoint.scope === "buyers:personal");

    expect(opened).toEqual([]);
  });
});
