import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { count, eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../../client.ts";
import {
  listings,
  listingTargets,
  oauthStates,
  orders,
  webhookEvents,
  member,
  storeConnections,
  tenantProfile,
  ticketMessages,
  tickets,
  user,
} from "../../schema/index.ts";
import { runSeed } from "./run.ts";

/** Migrations, catalog and ~6 months of sales for several accounts, twice. */
const SEED_TEST_TIMEOUT = 240_000;

const migrationsFolder = fileURLToPath(new URL("../../../migrations", import.meta.url));
const databaseName = `sb_seed_${randomBytes(6).toString("hex")}`;
let admin: postgres.Sql;
let database: Database;

const options = {
  cipher: createTokenCipher(randomBytes(32).toString("base64")),
  demoPassword: "senha-demo-123",
  adminPassword: "senha-admin-123",
};

async function tenantOf(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) {
    throw new Error(`conta ${email} não criada pelo seed`);
  }
  return row.tenantId;
}

async function storesOf(tenantId: string) {
  return database
    .select({ status: storeConnections.status, supplierId: storeConnections.supplierId })
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenantId));
}

async function totals() {
  const [ticketTotal] = await database.select({ total: count() }).from(tickets);
  const [storeTotal] = await database.select({ total: count() }).from(storeConnections);
  const [listingTotal] = await database.select({ total: count() }).from(listings);
  return { tickets: ticketTotal?.total, stores: storeTotal?.total, listings: listingTotal?.total };
}

beforeAll(async () => {
  loadRootEnvironmentFile();
  const serverUrl = process.env.DATABASE_URL;
  if (serverUrl === undefined) {
    throw new Error("DATABASE_URL é obrigatória para o teste do seed");
  }
  admin = postgres(serverUrl, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${databaseName}`;
  database = createDatabase(url.toString(), { maxConnections: 1 });
  await migrate(database, { migrationsFolder });
  await runSeed(database, options);
}, SEED_TEST_TIMEOUT);

afterAll(async () => {
  await database.$client.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
}, SEED_TEST_TIMEOUT);

describe("seed", { timeout: SEED_TEST_TIMEOUT }, () => {
  it("gives the admin a workspace with a connected store and listings", async () => {
    const tenantId = await tenantOf("admin@sellbridge.local");
    const stores = await storesOf(tenantId);
    expect(stores.length).toBeGreaterThanOrEqual(1);
    expect(stores.every((store) => store.status === "connected" && store.supplierId !== null)).toBe(
      true,
    );
    const [listingTotal] = await database
      .select({ total: count() })
      .from(listings)
      .where(eq(listings.tenantId, tenantId));
    expect(listingTotal?.total).toBeGreaterThan(0);
  });

  it("creates customers in the states the admin screens show", async () => {
    const active = await tenantOf("bruno@sellbridge.local");
    const expired = await tenantOf("carla@sellbridge.local");
    const onboarding = await tenantOf("daniel@sellbridge.local");

    expect((await storesOf(active)).map((store) => store.status)).toEqual(["connected"]);
    expect((await storesOf(expired)).map((store) => store.status)).toEqual(["expired"]);
    expect(await storesOf(onboarding)).toEqual([]);

    const holders = await database
      .select({ tenantId: tenantProfile.tenantId, cpf: tenantProfile.cpf })
      .from(tenantProfile)
      .where(inArray(tenantProfile.tenantId, [active, expired, onboarding]));
    expect(holders.map((row) => row.tenantId).toSorted()).toEqual([active, expired].toSorted());
  });

  it("opens support tickets in every status, each with its messages", async () => {
    const rows = await database
      .select({
        id: tickets.id,
        status: tickets.status,
        closedAt: tickets.closedAt,
        rating: tickets.rating,
        awaitingSince: tickets.awaitingSince,
      })
      .from(tickets);
    expect(new Set(rows.map((row) => row.status))).toEqual(new Set(["open", "answered", "closed"]));
    for (const row of rows) {
      const [messages] = await database
        .select({ total: count() })
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, row.id));
      expect(messages?.total).toBeGreaterThan(0);
      expect(row.awaitingSince === null).toBe(row.status !== "open");
    }
    const closed = rows.filter((row) => row.status === "closed");
    expect(closed.every((row) => row.closedAt !== null)).toBe(true);
    expect(closed.some((row) => row.rating !== null)).toBe(true);
  });

  it("changes nothing when it runs again", async () => {
    const before = await totals();
    await runSeed(database, options);
    expect(await totals()).toEqual(before);
  });
});

it(
  "retires legacy simulated integrations while preserving real stores and order history",
  async () => {
    const tenantId = await tenantOf("demo@sellbridge.local");
    const realStores = await storesOf(tenantId);
    const [history] = await database.select({ total: count() }).from(orders);
    const [store] = await database
      .insert(storeConnections)
      .values({
        tenantId,
        marketplace: "mock",
        externalShopId: randomUUID(),
        shopName: "Retired fixture",
        accessTokenEnc: "test-token",
        refreshTokenEnc: "test-refresh",
      })
      .returning();
    const product = await database.query.supplierProducts.findFirst();
    if (!store || !product) throw new Error("Migration fixtures were not created.");
    const [listing] = await database
      .insert(listings)
      .values({
        tenantId,
        supplierProductId: product.id,
        title: "Retired fixture listing",
        description: "Retired fixture description",
        priceCents: 4990,
      })
      .returning();
    if (!listing) throw new Error("Migration listing was not created.");
    const [target] = await database
      .insert(listingTargets)
      .values({
        tenantId,
        listingId: listing.id,
        storeConnectionId: store.id,
        idempotencyKey: randomUUID(),
        status: "published",
        externalUrl: "https://example.test/fixture",
      })
      .returning();
    const state = randomUUID();
    await database
      .insert(oauthStates)
      .values({ state, tenantId, marketplace: "mock", expiresAt: new Date(Date.now() + 60000) });
    const [event] = await database
      .insert(webhookEvents)
      .values({
        marketplace: "mock",
        externalEventId: randomUUID(),
        topic: "orders",
        rawPayload: {},
        signatureValid: true,
      })
      .returning();
    const migration = await readFile(
      new URL("../../../migrations/0054_retire_simulated_stores.sql", import.meta.url),
      "utf8",
    );
    await database.transaction(async (transaction) => {
      for (const statement of migration.split("--> statement-breakpoint"))
        await transaction.execute(sql.raw(statement));
    });
    expect(
      await database.query.oauthStates.findFirst({ where: eq(oauthStates.state, state) }),
    ).toBeUndefined();
    expect(
      await database.query.storeConnections.findFirst({ where: eq(storeConnections.id, store.id) }),
    ).toMatchObject({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null });
    if (!target || !event) throw new Error("Migration target or event was not created.");
    expect(
      await database.query.listingTargets.findFirst({ where: eq(listingTargets.id, target.id) }),
    ).toMatchObject({ status: "paused", externalUrl: null });
    expect(
      (await database.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, event.id) }))
        ?.processedAt,
    ).toBeInstanceOf(Date);
    const [preserved] = await database.select({ total: count() }).from(orders);
    expect(preserved?.total).toBe(history?.total);
    expect((await storesOf(tenantId)).filter((value) => value.status === "connected")).toHaveLength(
      realStores.length,
    );
  },
  SEED_TEST_TIMEOUT,
);
