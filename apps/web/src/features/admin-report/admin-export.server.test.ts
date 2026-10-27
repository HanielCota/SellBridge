import type { CustomerSummary } from "@sellbridge/database/repositories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MODE_COOKIE } from "@/features/auth/admin-mode-cookie";

const mocks = vi.hoisted(() => ({
  signals: vi.fn<() => Promise<CustomerSummary[]>>(),
  facts: vi.fn<() => Promise<[]>>(),
  record: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } },
}));
vi.mock("./admin-report.server", () => ({ loadAdminReportRows: vi.fn<() => Promise<unknown>>() }));
vi.mock("@sellbridge/database/repositories", () => ({
  MAX_CUSTOMERS_RANKED: 5_000,
  listCustomerSignals: mocks.signals,
  listProfileExportFacts: mocks.facts,
  listAuditEntries: vi.fn<() => Promise<unknown>>(),
  listTicketsForExport: vi.fn<() => Promise<unknown>>(),
  recordReportExport: mocks.record,
}));

const { handleAdminExport } = await import("./admin-export.server");
const { loadClientsCsv } = await import("./admin-export-loaders.server");
const NOW = new Date("2026-10-27T12:00:00Z");
const CUSTOMER: CustomerSummary = {
  id: "customer",
  name: "Customer",
  email: "customer@sellbridge.test",
  emailVerified: true,
  role: "user",
  banned: false,
  banReason: null,
  createdAt: NOW,
  tenantId: "tenant",
  connectedStores: 0,
  publishedListings: 0,
  failedListings: 0,
  recentOrders: 0,
  recentRevenueCents: 0,
  previousOrders: 0,
  hasHolder: false,
  hasSupplier: false,
  stores: [],
  waitingTickets: 0,
  lastSeenAt: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.facts.mockResolvedValue([]);
});

describe("customer export completeness", () => {
  it("refuses an incomplete customer spreadsheet with 422 before recording a download", async () => {
    mocks.signals.mockResolvedValue(Array.from({ length: 5_001 }, () => CUSTOMER));
    const request = new Request("https://sellbridge.test/api/admin/exportar/clientes?mes=2026-09", {
      headers: { cookie: `${ADMIN_MODE_COOKIE}=on` },
    });
    const response = await handleAdminExport(request, {
      kind: "clientes",
      permission: "customers.manage",
      filePrefix: "clients",
      load: loadClientsCsv,
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.facts).not.toHaveBeenCalled();
  });
});
