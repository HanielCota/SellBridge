import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { reportSnapshots } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  findReportSnapshot,
  replaceEarlyReportSnapshot,
  replaceOutdatedReportSnapshot,
  saveReportSnapshot,
} from "./report-snapshots.ts";

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

  it("replaces a month kept before it ended, once, and keeps one kept after", async () => {
    const ownerId = randomUUID();
    owners.push(ownerId);
    const key = { scope: "seller", ownerId, month: "2026-09" } as const;
    const monthEnd = new Date("2026-10-01T03:00:00.000Z");
    await saveReportSnapshot(database, key, { version: 1, orders: 10 });
    await database
      .update(reportSnapshots)
      .set({ capturedAt: new Date("2026-09-30T13:00:00.000Z") })
      .where(and(eq(reportSnapshots.ownerId, ownerId), eq(reportSnapshots.month, key.month)));

    const rebuilt = await replaceEarlyReportSnapshot(
      database,
      key,
      { version: 1, orders: 12 },
      monthEnd,
    );
    const again = await replaceEarlyReportSnapshot(
      database,
      key,
      { version: 1, orders: 99 },
      monthEnd,
    );

    expect(rebuilt.payload).toEqual({ version: 1, orders: 12 });
    expect(rebuilt.capturedAt.getTime()).toBeGreaterThanOrEqual(monthEnd.getTime());
    expect(again.payload).toEqual({ version: 1, orders: 12 });
  });

  it("rebuilds a month kept by an older report version once and never rolls a newer one back", async () => {
    const ownerId = randomUUID();
    owners.push(ownerId);
    const key = { scope: "seller", ownerId, month: "2026-10" } as const;
    const newer = { scope: "supplier", ownerId, month: "2026-10" } as const;
    await saveReportSnapshot(database, key, { version: 1, orders: 10 });
    await saveReportSnapshot(database, newer, { version: 3, orders: 7 });

    const upgraded = await replaceOutdatedReportSnapshot(
      database,
      key,
      { version: 2, orders: 11 },
      2,
    );
    const again = await replaceOutdatedReportSnapshot(database, key, { version: 2, orders: 99 }, 2);
    const kept = await replaceOutdatedReportSnapshot(database, newer, { version: 2, orders: 1 }, 2);

    expect(upgraded.payload).toEqual({ version: 2, orders: 11 });
    expect(again.payload).toEqual({ version: 2, orders: 11 });
    expect(kept.payload).toEqual({ version: 3, orders: 7 });
  });
});
