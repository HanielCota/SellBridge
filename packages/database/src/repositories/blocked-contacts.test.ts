import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminAuditEvents } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import { recordBlockedContact } from "./blocked-contacts.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let userId = "";

beforeAll(async () => {
  users = await createTestUsers(database, 1);
  [userId = ""] = users.ids;
});

afterAll(async () => {
  await database.delete(adminAuditEvents).where(eq(adminAuditEvents.userId, userId));
  await users.cleanup();
  await database.$client.end();
});

describe("recordBlockedContact", () => {
  it("records who tried, where and what kind of contact, never the text", async () => {
    await recordBlockedContact(database, {
      channel: "seller_app",
      field: "notes",
      kinds: ["phone", "email"],
      tenantId: "tenant-1",
      userId,
      supplierToken: null,
    });

    const rows = await database
      .select()
      .from(adminAuditEvents)
      .where(
        and(eq(adminAuditEvents.userId, userId), eq(adminAuditEvents.action, "contact_blocked")),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adminId).toBeNull();
    expect(rows[0]?.details).toEqual({
      channel: "seller_app",
      field: "notes",
      kinds: "phone,email",
      tenantId: "tenant-1",
      impersonatedBy: null,
    });
  });

  it("keeps one entry per person and field every ten minutes, so retries do not flood the trail", async () => {
    const attempt = {
      channel: "seller_app" as const,
      field: "address.street",
      kinds: ["phone"],
      tenantId: "tenant-1",
      userId,
      supplierToken: null,
    };
    await recordBlockedContact(database, attempt);
    await recordBlockedContact(database, attempt);
    await recordBlockedContact(database, { ...attempt, kinds: ["email"] });
    await recordBlockedContact(database, { ...attempt, field: "notes" });

    const rows = await database
      .select({ details: adminAuditEvents.details })
      .from(adminAuditEvents)
      .where(
        and(eq(adminAuditEvents.userId, userId), eq(adminAuditEvents.action, "contact_blocked")),
      );
    const fields = rows.map((row) => row.details?.field);
    expect(fields.filter((field) => field === "address.street")).toHaveLength(1);
  });

  it("leaves no entry for a supplier link that matches no shipment", async () => {
    const before = await database.$count(
      adminAuditEvents,
      eq(adminAuditEvents.action, "contact_blocked"),
    );
    await recordBlockedContact(database, {
      channel: "supplier_link",
      field: "update.note",
      kinds: ["phone"],
      tenantId: null,
      userId: null,
      supplierToken: "f".repeat(64),
    });
    const after = await database.$count(
      adminAuditEvents,
      eq(adminAuditEvents.action, "contact_blocked"),
    );
    expect(after).toBe(before);
  });
});
