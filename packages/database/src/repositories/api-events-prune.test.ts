import { eq, inArray } from "drizzle-orm";
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
