import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { reportSnapshots } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { findReportSnapshot, saveReportSnapshot } from "./report-snapshots.ts";

const database = createTestDatabase();
const owners: string[] = [];

afterAll(async () => {
  await database.delete(reportSnapshots).where(inArray(reportSnapshots.ownerId, owners));
  await database.$client.end();
});

describe("report snapshots", () => {
  it("keeps the first numbers of a closed month even when saved again", async () => {
    const ownerId = randomUUID();
    owners.push(ownerId);
    const key = { scope: "seller", ownerId, month: "2026-09" } as const;
    expect(await findReportSnapshot(database, key)).toBeNull();

    const first = await saveReportSnapshot(database, key, { version: 1, orders: 10 });
    const second = await saveReportSnapshot(database, key, { version: 1, orders: 99 });

    expect(first.payload).toEqual({ version: 1, orders: 10 });
    expect(second.payload).toEqual({ version: 1, orders: 10 });
    expect(second.capturedAt.getTime()).toBe(first.capturedAt.getTime());
  });

  it("keeps each owner and month apart", async () => {
    const ownerId = randomUUID();
    owners.push(ownerId);
    await saveReportSnapshot(
      database,
      { scope: "supplier", ownerId, month: "2026-08" },
      { orders: 1 },
    );
    expect(
      await findReportSnapshot(database, { scope: "supplier", ownerId, month: "2026-09" }),
    ).toBeNull();
    expect(
      await findReportSnapshot(database, { scope: "seller", ownerId, month: "2026-08" }),
    ).toBeNull();
  });
});
