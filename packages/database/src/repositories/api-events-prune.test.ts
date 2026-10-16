import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiEvents } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { pruneApiEvents, recordApiEvent } from "./api-events.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantId = "";

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  tenantId = tenants.ids[0] ?? "";
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

describe("pruneApiEvents", () => {
  it("removes events older than the cutoff and keeps the recent ones", async () => {
    const data = {
      orderId: "o-1",
      externalOrderId: "E-1",
      storeId: "s-1",
      status: "paid",
      previousStatus: null,
      totalCents: 1000,
      orderedAt: "2026-01-01T00:00:00.000Z",
    };
    await recordApiEvent(database, { tenantId, type: "order.created", data });
    await recordApiEvent(database, { tenantId, type: "order.created", data });
    const ours = await database
      .select({ id: apiEvents.id })
      .from(apiEvents)
      .where(eq(apiEvents.tenantId, tenantId));
    const [old, recent] = ours.map((row) => row.id);
    await database
      .update(apiEvents)
      .set({ createdAt: new Date("2020-01-01T00:00:00Z") })
      .where(eq(apiEvents.id, old ?? ""));

    await pruneApiEvents(database, new Date("2021-01-01T00:00:00Z"));

    const left = await database
      .select({ id: apiEvents.id })
      .from(apiEvents)
      .where(inArray(apiEvents.id, [old ?? "", recent ?? ""]));
    expect(left.map((row) => row.id)).toEqual([recent]);
  });
});

describe("recordApiEvent timing", () => {
  const data = {
    orderId: "o-2",
    externalOrderId: "E-2",
    storeId: "s-1",
    status: "paid",
    previousStatus: null,
    totalCents: 1000,
    orderedAt: "2026-01-01T00:00:00.000Z",
  };

  // Regression: an event was dated at the start of its transaction, so one that waited on a lock
  // before the insert looked settled the moment it committed, and /events could skip it.
  it("dates the event when it is written, not when its transaction began", async () => {
    const { createdAt, began } = await database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_sleep(0.3)`);
      const id = await recordApiEvent(transaction, { tenantId, type: "order.created", data });
      const [row] = await transaction
        .select({ createdAt: apiEvents.createdAt, began: sql<string>`now()::text` })
        .from(apiEvents)
        .where(eq(apiEvents.id, id));
      if (row === undefined) throw new Error("event not written");
      return { createdAt: row.createdAt, began: new Date(row.began) };
    });
    expect(createdAt.getTime() - began.getTime()).toBeGreaterThanOrEqual(250);
  });

  it("caps the lock wait of the rest of the transaction below the settle window", async () => {
    const timeout = await database.transaction(async (transaction) => {
      await recordApiEvent(transaction, { tenantId, type: "order.created", data });
      const [row] = await transaction.execute(sql`show lock_timeout`);
      return row?.["lock_timeout"];
    });
    expect(timeout).toBe("3s");
  });
});
