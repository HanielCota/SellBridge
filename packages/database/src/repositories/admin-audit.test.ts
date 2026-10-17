import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ticketEvents, tickets, user } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  createTestUsers,
} from "../testing/fixtures.ts";
import { listAuditEntries, recordCatalogEvent } from "./admin-audit.ts";
import { recordAdminEvent } from "./customer-care.ts";

/*
 * Item 28.b: one trail for what the team did, wherever it did it: a customer's account, the
 * supplier catalog or a support ticket. Each test reads only its own actor's entries, since
 * other packages write to the same database at the same time.
 */
const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let staffId = "";
let otherStaffId = "";
let customerId = "";
let ticketId = "";
const SKU = `AUD-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  users = await createTestUsers(database, 3);
  [staffId = "", otherStaffId = "", customerId = ""] = users.ids;
  await database.update(user).set({ role: "admin", name: "Ana Admin" }).where(eq(user.id, staffId));
  await database.update(user).set({ role: "agent" }).where(eq(user.id, otherStaffId));
  await database.update(user).set({ name: "Carla Cliente" }).where(eq(user.id, customerId));
  tenants = await createTestTenants(database, 1);
  catalog = await createTestSupplierProduct(database, {
    sku: SKU,
    title: "Escova auditada",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  const [ticket] = await database
    .insert(tickets)
    .values({ tenantId: tenants.ids[0] ?? "", createdById: customerId, subject: "Loja caiu" })
    .returning({ id: tickets.id });
  ticketId = ticket?.id ?? "";

  await recordAdminEvent(database, { adminId: staffId, userId: customerId, action: "ban_changed" });
  await recordCatalogEvent(database, {
    adminId: staffId,
    entityType: "product",
    entityId: catalog.productId,
    action: "product.deactivated",
  });
  await database.insert(ticketEvents).values([
    { ticketId, actorId: staffId, type: "assigned", fromValue: null, toValue: staffId },
    // The reseller's own changes and the system's are not the team's doing.
    { ticketId, actorId: customerId, type: "rated", toValue: "5" },
    { ticketId, actorId: null, automatic: true, type: "status_changed", toValue: "closed" },
  ]);
});

afterAll(async () => {
  await database.delete(tickets).where(eq(tickets.id, ticketId));
  await tenants.cleanup();
  await catalog.cleanup();
  await users.cleanup();
  await database.$client.end();
});

const firstPage = { page: 1, pageSize: 25 };

describe("global audit", () => {
  it("joins account, catalog and support actions of the team, newest first", async () => {
    const result = await listAuditEntries(database, { ...firstPage, actorId: staffId });
    expect(result.total).toBe(3);
    expect(result.items.map((entry) => [entry.source, entry.action])).toEqual([
      ["support", "ticket.assigned"],
      ["catalog", "product.deactivated"],
      ["account", "ban_changed"],
    ]);
    expect(result.items.every((entry) => entry.actorName === "Ana Admin")).toBe(true);
    expect(result.items.map((entry) => entry.subjectLabel)).toEqual([
      "Loja caiu",
      "Escova auditada",
      "Carla Cliente",
    ]);
  });

  it("leaves out what resellers and the system did on tickets", async () => {
    const asCustomer = await listAuditEntries(database, { ...firstPage, actorId: customerId });
    expect(asCustomer.items).toEqual([]);
  });

  it("filters by source and by text, and pages", async () => {
    const catalogOnly = await listAuditEntries(database, {
      ...firstPage,
      actorId: staffId,
      source: "catalog",
    });
    expect(catalogOnly.items.map((entry) => entry.action)).toEqual(["product.deactivated"]);

    const byText = await listAuditEntries(database, {
      ...firstPage,
      actorId: staffId,
      query: "loja",
    });
    expect(byText.items.map((entry) => entry.subjectLabel)).toEqual(["Loja caiu"]);

    const secondPage = await listAuditEntries(database, { page: 2, pageSize: 2, actorId: staffId });
    expect(secondPage).toMatchObject({ total: 3, page: 2, totalPages: 2 });
    expect(secondPage.items.map((entry) => entry.action)).toEqual(["ban_changed"]);
  });

  it("never returns e-mails or other account data of the people involved", async () => {
    const result = await listAuditEntries(database, { ...firstPage, actorId: staffId });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("@sellbridge.test");
  });

  it("keeps an entry whose actor was deleted, without a name", async () => {
    const [gone] = (await createTestUsers(database, 1)).ids;
    await recordCatalogEvent(database, {
      adminId: gone ?? "",
      entityType: "supplier",
      entityId: catalog.supplierId,
      action: "supplier.saved",
    });
    await database.delete(user).where(inArray(user.id, [gone ?? ""]));
    const result = await listAuditEntries(database, {
      ...firstPage,
      query: `Fornecedor de teste ${SKU}`,
    });
    expect(result.items).toEqual([
      expect.objectContaining({ action: "supplier.saved", actorName: null, actorId: null }),
    ]);
  });
});
