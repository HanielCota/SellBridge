import { and, eq } from "drizzle-orm";
import { schema } from "@sellbridge/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestProduct,
  createTestStore,
  createTestTarget,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import {
  createPublishRecoveryProcessor,
  type RecoveryJob,
  STALLED_PUBLISHING_REASON,
} from "./publish-recovery.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let storeId = "";

const HOUR = 60 * 60 * 1000;

async function createTargetIn(
  status: "pending" | "publishing",
  updatedAt: Date,
  title: string,
): Promise<string> {
  const targetId = await createTestTarget(database, {
    tenantId: tenants.first,
    productId: catalog.productId,
    storeId,
    title,
  });
  await database
    .update(schema.listingTargets)
    .set({ status, updatedAt })
    .where(eq(schema.listingTargets.id, targetId));
  return targetId;
}

async function targetStatus(targetId: string) {
  const row = await database.query.listingTargets.findFirst({
    where: eq(schema.listingTargets.id, targetId),
  });
  return row ? { status: row.status, errorReason: row.errorReason } : null;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  catalog = await createTestProduct(database, { sku: "R-1", title: "Produto recovery", stock: 3 });
  storeId = (await createTestStore(environment, tenants.first, "connected")).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("publish-recovery processor", () => {
  it("re-queues pending targets whose job was lost and leaves fresh ones alone", async () => {
    const now = new Date();
    const lost = await createTargetIn("pending", new Date(now.getTime() - HOUR), "Perdido");
    const fresh = await createTargetIn("pending", now, "Recém-criado");
    const queued: RecoveryJob[] = [];
    const recover = createPublishRecoveryProcessor({
      database,
      enqueue: async (jobs) => {
        queued.push(...jobs);
      },
      now: () => now,
    });

    await recover();

    const queuedIds = queued.map((job) => job.data.listingTargetId);
    expect(queuedIds).toContain(lost);
    expect(queuedIds).not.toContain(fresh);
    const lostJob = queued.find((job) => job.data.listingTargetId === lost);
    expect(lostJob?.data).toEqual({ tenantId: tenants.first, listingTargetId: lost });
    expect(lostJob?.jobId).not.toContain(":");
    expect(await targetStatus(lost)).toMatchObject({ status: "pending" });
  });

  it("turns publications stuck mid-call into errors with a listing.failed event", async () => {
    const now = new Date();
    const stuck = await createTargetIn("publishing", new Date(now.getTime() - HOUR), "Travado");
    const running = await createTargetIn("publishing", now, "Em andamento");
    const recover = createPublishRecoveryProcessor({
      database,
      enqueue: async () => {},
      now: () => now,
    });

    const result = await recover();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(await targetStatus(stuck)).toEqual({
      status: "error",
      errorReason: STALLED_PUBLISHING_REASON,
    });
    expect(await targetStatus(running)).toMatchObject({ status: "publishing" });
    const events = await database
      .select({ data: schema.apiEvents.data })
      .from(schema.apiEvents)
      .where(
        and(
          eq(schema.apiEvents.tenantId, tenants.first),
          eq(schema.apiEvents.type, "listing.failed"),
        ),
      );
    expect(events.map((event) => event.data)).toContainEqual(
      expect.objectContaining({ listingTargetId: stuck, status: "error" }),
    );
  });
});
