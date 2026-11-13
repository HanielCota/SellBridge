import { randomUUID } from "node:crypto";
import type { CapturedProblem } from "@sellbridge/shared/problem-capture";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { member, problemEvents, storeConnections } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  getProblemEvent,
  listProblemEvents,
  pruneProblemEvents,
  recordProblems,
  setProblemResolved,
} from "./problem-events.ts";

/*
 * Each test uses its own fingerprints and reads back only its own rows: other test files may
 * write problems to the same database at the same time.
 */
const database = createTestDatabase();
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-13T14:00:00Z");
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantId = "";
let ownerId = "";
let storeId = "";
const createdFingerprints: string[] = [];

function problem(overrides: Partial<CapturedProblem> = {}): CapturedProblem {
  const fingerprint = overrides.fingerprint ?? randomUUID();
  createdFingerprints.push(fingerprint);
  return {
    service: "worker",
    event: "listing.publish_failed",
    area: "publishing",
    message: "O Mercado Livre recusou o título",
    fingerprint,
    tenantId: null,
    storeConnectionId: null,
    listingTargetId: null,
    context: { reason: "O Mercado Livre recusou o título" },
    occurredAt: NOW,
    ...overrides,
  };
}

async function rowsOf(fingerprint: string) {
  return database
    .select()
    .from(problemEvents)
    .where(eq(problemEvents.fingerprint, fingerprint))
    .orderBy(problemEvents.firstSeenAt);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 1);
  tenantId = tenants.ids[0] ?? "";
  ownerId = users.ids[0] ?? "";
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: tenantId,
    userId: ownerId,
    role: "owner",
    createdAt: new Date(),
  });
  const [store] = await database
    .insert(storeConnections)
    .values(testStoreInput(tenantId, `shop-${randomUUID()}`))
    .returning({ id: storeConnections.id });
  storeId = store?.id ?? "";
});

afterAll(async () => {
  await database
    .delete(problemEvents)
    .where(inArray(problemEvents.fingerprint, createdFingerprints));
  await tenants.cleanup();
  await users.cleanup();
});

describe("recordProblems", () => {
  it("adds repeats of an open problem within a day to its counter", async () => {
    const first = problem();
    const later = { ...first, occurredAt: new Date(NOW.getTime() + 2 * HOUR), message: "de novo" };

    await recordProblems(database, [{ problem: first, count: 3 }]);
    await recordProblems(database, [{ problem: later, count: 2 }]);

    const rows = await rowsOf(first.fingerprint);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      occurrences: 5,
      message: "de novo",
      firstSeenAt: NOW,
      lastSeenAt: later.occurredAt,
    });
  });

  it("opens a new row when the same problem comes back after more than a day", async () => {
    const first = problem();
    const nextWeek = { ...first, occurredAt: new Date(NOW.getTime() + 25 * HOUR) };

    await recordProblems(database, [{ problem: first, count: 1 }]);
    await recordProblems(database, [{ problem: nextWeek, count: 1 }]);

    expect(await rowsOf(first.fingerprint)).toHaveLength(2);
  });

  it("opens a new row when the problem was marked resolved", async () => {
    const first = problem();
    await recordProblems(database, [{ problem: first, count: 1 }]);
    const [row] = await rowsOf(first.fingerprint);
    await setProblemResolved(database, { id: row?.id ?? "", resolvedById: ownerId, now: NOW });

    await recordProblems(database, [{ problem: first, count: 1 }]);

    const rows = await rowsOf(first.fingerprint);
    expect(rows.map((item) => item.resolvedAt === null)).toEqual([false, true]);
  });
});

describe("listProblemEvents", () => {
  it("names the account from the store and links to its owner", async () => {
    const stored = problem({ storeConnectionId: storeId, area: "orders" });
    await recordProblems(database, [{ problem: stored, count: 1 }]);
    const [row] = await rowsOf(stored.fingerprint);

    const detail = await getProblemEvent(database, row?.id ?? "");

    expect(detail).toMatchObject({
      tenantId,
      accountUserId: ownerId,
      storeConnectionId: storeId,
      context: stored.context,
      resolvedByName: null,
    });
    expect(detail?.accountName).toContain("Tenant de teste");
    expect(detail?.storeName).not.toBeNull();
  });

  it("pages through open problems of an area, newest first", async () => {
    const area = "invoices";
    const since = new Date(NOW.getTime() + 100 * HOUR);
    const problems = [1, 2, 3].map((hours) =>
      problem({ area, occurredAt: new Date(since.getTime() + hours * HOUR) }),
    );
    await recordProblems(
      database,
      problems.map((item) => ({ problem: item, count: 1 })),
    );

    const first = await listProblemEvents(database, { status: "open", area, since, limit: 2 });
    const second = await listProblemEvents(database, {
      status: "open",
      area,
      since,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    const ids = [...first.items, ...second.items].map((item) => item.lastSeenAt.getTime());
    expect(ids).toEqual(problems.map((item) => item.occurredAt.getTime()).toReversed());
    expect(second.nextCursor).toBeNull();
  });

  it("lists resolved problems apart from open ones", async () => {
    const since = new Date(NOW.getTime() + 200 * HOUR);
    const resolved = problem({ area: "email", occurredAt: since });
    await recordProblems(database, [{ problem: resolved, count: 1 }]);
    const [row] = await rowsOf(resolved.fingerprint);
    await setProblemResolved(database, { id: row?.id ?? "", resolvedById: ownerId, now: NOW });

    const open = await listProblemEvents(database, {
      status: "open",
      area: "email",
      since,
      limit: 50,
    });
    const done = await listProblemEvents(database, {
      status: "resolved",
      area: "email",
      since,
      limit: 50,
    });

    expect(open.items.map((item) => item.id)).not.toContain(row?.id);
    expect(done.items.map((item) => item.id)).toContain(row?.id);
  });
});

describe("setProblemResolved", () => {
  it("undoes a resolution", async () => {
    const stored = problem();
    await recordProblems(database, [{ problem: stored, count: 1 }]);
    const [row] = await rowsOf(stored.fingerprint);
    const id = row?.id ?? "";

    await setProblemResolved(database, { id, resolvedById: ownerId, now: NOW });
    const resolved = await getProblemEvent(database, id);
    await setProblemResolved(database, { id, resolvedById: null, now: NOW });
    const reopened = await getProblemEvent(database, id);

    expect(resolved?.resolvedAt).toEqual(NOW);
    expect(resolved?.resolvedByName).not.toBeNull();
    expect(reopened?.resolvedAt).toBeNull();
  });

  it("answers false for a problem that no longer exists", async () => {
    const updated = await setProblemResolved(database, {
      id: randomUUID(),
      resolvedById: ownerId,
      now: NOW,
    });

    expect(updated).toBe(false);
  });
});

describe("pruneProblemEvents", () => {
  it("deletes problems unseen for 30 days", async () => {
    const old = problem({ occurredAt: new Date(NOW.getTime() - 31 * 24 * HOUR) });
    const recent = problem({ occurredAt: new Date(NOW.getTime() - 29 * 24 * HOUR) });
    await recordProblems(database, [
      { problem: old, count: 1 },
      { problem: recent, count: 1 },
    ]);

    await pruneProblemEvents(database, { now: NOW });

    expect(await rowsOf(old.fingerprint)).toHaveLength(0);
    expect(await rowsOf(recent.fingerprint)).toHaveLength(1);
  });

  it("keeps the table under the row cap, deleting the problems seen longest ago", async () => {
    const oldest = problem({ occurredAt: new Date(NOW.getTime() - 29.9 * 24 * HOUR) });
    const newer = problem({ occurredAt: new Date(NOW.getTime() - 29.8 * 24 * HOUR) });
    await recordProblems(database, [
      { problem: oldest, count: 1 },
      { problem: newer, count: 1 },
    ]);
    const total = await database.$count(problemEvents);

    await pruneProblemEvents(database, { now: NOW, maximumRows: total - 1 });

    expect(await rowsOf(oldest.fingerprint)).toHaveLength(0);
    expect(await rowsOf(newer.fingerprint)).toHaveLength(1);
  });
});
