import { assertBillingCapacity, lockBillingTenant } from "./billing.ts";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq, inArray, isNotNull, isNull, gt, lt, ne, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { isUniqueViolation } from "../postgres-errors.ts";
import { timestampOf } from "./sql/raw-values.ts";
import { member, organization, oauthStates, storeConnections } from "../schema/index.ts";
import { notifyStoreExpired } from "./notification-producers.ts";

type StoreConnectionRow = typeof storeConnections.$inferSelect;
export type Marketplace = StoreConnectionRow["marketplace"];
export type StoreStatus = StoreConnectionRow["status"];

export interface StoreConnectionSummary {
  id: string;
  marketplace: Marketplace;
  shopName: string;
  externalShopId: string;
  /** The one supplier whose products this shop sells; null while the seller has not picked one. */
  supplierId: string | null;
  status: StoreStatus;
  lastError: string | null;
  expiresAt: Date | null;
  /** When the marketplace last sent an event about this shop; null until the first one. */
  lastWebhookAt: Date | null;
  connectedAt: Date;
}

const summaryColumns = {
  id: storeConnections.id,
  marketplace: storeConnections.marketplace,
  shopName: storeConnections.shopName,
  externalShopId: storeConnections.externalShopId,
  supplierId: storeConnections.supplierId,
  status: storeConnections.status,
  lastError: storeConnections.lastError,
  expiresAt: storeConnections.expiresAt,
  lastWebhookAt: storeConnections.lastWebhookAt,
  connectedAt: storeConnections.connectedAt,
};

export async function listStoreConnections(
  database: Database,
  tenantId: string,
): Promise<StoreConnectionSummary[]> {
  return database
    .select(summaryColumns)
    .from(storeConnections)
    .where(
      and(eq(storeConnections.tenantId, tenantId), ne(storeConnections.status, "disconnected")),
    )
    .orderBy(asc(storeConnections.connectedAt));
}

/** Returns only the requested stores that belong to the tenant and are connected. */
export async function findConnectedStores(
  database: Database,
  tenantId: string,
  storeConnectionIds: readonly string[],
): Promise<StoreConnectionSummary[]> {
  if (storeConnectionIds.length === 0) {
    return [];
  }
  return database
    .select(summaryColumns)
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
        eq(storeConnections.status, "connected"),
      ),
    );
}

export interface UpsertStoreConnectionInput {
  billingEnabled?: boolean;
  tenantId: string;
  marketplace: Marketplace;
  externalShopId: string;
  shopName: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
  /**
   * The supplier a new shop sells. Reconnecting a shop keeps the one it already has; null leaves
   * a new shop pending until the seller picks one.
   */
  supplierId?: string | null;
}

const SHOP_IN_USE_MESSAGE =
  "Esta loja já está conectada em outra conta do SellBridge. Desconecte-a lá antes de conectar aqui.";

/** The partial unique index of `schema/stores.ts`: one live connection per marketplace shop. */
const LIVE_SHOP_INDEX = "store_connections_live_shop_idx";

/**
 * One marketplace shop belongs to one organization at a time. A second organization connecting
 * the same shop (someone else with access to the seller's account) would split its orders, with
 * the buyers' data, between both, whichever the webhook happens to find.
 */
async function assertShopFreeForTenant(
  executor: DatabaseExecutor,
  input: Pick<UpsertStoreConnectionInput, "tenantId" | "marketplace" | "externalShopId">,
): Promise<void> {
  const [other] = await executor
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.marketplace, input.marketplace),
        eq(storeConnections.externalShopId, input.externalShopId),
        ne(storeConnections.tenantId, input.tenantId),
        ne(storeConnections.status, "disconnected"),
      ),
    )
    .limit(1);
  if (other) {
    throw conflictError(SHOP_IN_USE_MESSAGE);
  }
}

/**
 * Connecting the same shop again reactivates it with fresh tokens. Two organizations connecting
 * the same shop at once both pass the check (neither sees the other's uncommitted row): the
 * unique index refuses the second, which gets the same conflict as the check.
 */
export async function upsertStoreConnection(
  database: Database,
  input: UpsertStoreConnectionInput,
): Promise<StoreConnectionSummary> {
  try {
    return await database.transaction(async (executor) => saveStoreConnection(executor, input));
  } catch (error) {
    if (isUniqueViolation(error, LIVE_SHOP_INDEX)) {
      throw conflictError(SHOP_IN_USE_MESSAGE);
    }
    throw error;
  }
}

async function saveStoreConnection(
  executor: DatabaseExecutor,
  input: UpsertStoreConnectionInput,
): Promise<StoreConnectionSummary> {
  await assertShopFreeForTenant(executor, input);
  if (input.billingEnabled) {
    await lockBillingTenant(executor, input.tenantId);
    const [existing] = await executor
      .select()
      .from(storeConnections)
      .where(
        and(
          eq(storeConnections.tenantId, input.tenantId),
          eq(storeConnections.marketplace, input.marketplace),
          eq(storeConnections.externalShopId, input.externalShopId),
          ne(storeConnections.status, "disconnected"),
        ),
      );
    if (!existing) await assertBillingCapacity(executor, input.tenantId, "stores");
  }
  const { billingEnabled: _billingEnabled, supplierId = null, ...connection } = input;
  const values = { ...connection, status: "connected" as const, lastError: null };
  const [row] = await executor
    .insert(storeConnections)
    .values({ ...values, supplierId, connectedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        storeConnections.tenantId,
        storeConnections.marketplace,
        storeConnections.externalShopId,
      ],
      // A reconnected shop keeps its supplier; a pending one takes the supplier just picked.
      set: { ...values, supplierId: sql`coalesce(${storeConnections.supplierId}, ${supplierId})` },
    })
    .returning(summaryColumns);
  if (!row) {
    throw conflictError("Não foi possível salvar a conexão da loja");
  }
  return row;
}

export async function disconnectStore(
  database: Database,
  tenantId: string,
  storeConnectionId: string,
): Promise<void> {
  const [row] = await database
    .update(storeConnections)
    .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null })
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.id, storeConnectionId)))
    .returning({ id: storeConnections.id });
  if (!row) {
    throw notFoundError("Loja não encontrada");
  }
}

export interface StoreTokenRotation {
  storeConnectionId: string;
  /** Refresh token the new tokens were obtained with; the swap only happens if it is still saved. */
  previousRefreshTokenEnc: string;
  tokens: { accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: Date | null };
}

/**
 * Compare-and-swap of the tokens of a connected store. Returns false, changing nothing, when the
 * seller disconnected or reconnected the store meanwhile, or another run already rotated them.
 */
export async function updateStoreTokens(
  database: Database,
  rotation: StoreTokenRotation,
): Promise<boolean> {
  const updated = await database
    .update(storeConnections)
    .set({ ...rotation.tokens, lastError: null })
    .where(
      and(
        eq(storeConnections.id, rotation.storeConnectionId),
        eq(storeConnections.status, "connected"),
        eq(storeConnections.refreshTokenEnc, rotation.previousRefreshTokenEnc),
      ),
    )
    .returning({ id: storeConnections.id });
  return updated.length > 0;
}

export interface StoreStatusChange {
  storeConnectionId: string;
  status: Exclude<StoreStatus, "connected" | "disconnected">;
  lastError: string;
  /** When given, the change only applies while this refresh token is still the saved one. */
  refreshTokenEnc?: string;
  /**
   * When given, the change only applies while this access token is still the saved one: a call
   * made with the token from before a reconnection must not expire the new connection.
   */
  accessTokenEnc?: string;
}

/**
 * Marks a connected store as failed (the seller has to act). A store the seller disconnected stays
 * disconnected. Returns whether the store changed.
 */
export async function markStoreStatus(
  database: Database,
  change: StoreStatusChange,
): Promise<boolean> {
  const conditions = [
    eq(storeConnections.id, change.storeConnectionId),
    eq(storeConnections.status, "connected"),
  ];
  if (change.refreshTokenEnc !== undefined) {
    conditions.push(eq(storeConnections.refreshTokenEnc, change.refreshTokenEnc));
  }
  if (change.accessTokenEnc !== undefined) {
    conditions.push(eq(storeConnections.accessTokenEnc, change.accessTokenEnc));
  }
  return database.transaction(async (transaction) => {
    const updated = await transaction
      .update(storeConnections)
      .set({ status: change.status, lastError: change.lastError })
      .where(and(...conditions))
      .returning({ id: storeConnections.id });
    if (updated.length === 0) {
      return false;
    }
    if (change.status === "expired") {
      await notifyStoreExpired(transaction, change.storeConnectionId, new Date());
    }
    return true;
  });
}

/** A burst of events writes the store row once a minute, not once per event. */
const WEBHOOK_STAMP_STEP = sql`interval '1 minute'`;

/**
 * Stamps when the marketplace last sent an event about this shop. Only moves forward, so a late
 * retry of an old event never makes the store look quieter than it is. `updatedAt` is kept: the
 * bell dates a store's problem by it, and an event is not a change to the store.
 */
export async function recordStoreWebhook(
  database: Database,
  webhook: { storeConnectionId: string; receivedAt: Date },
): Promise<void> {
  await database
    .update(storeConnections)
    .set({ lastWebhookAt: webhook.receivedAt, updatedAt: sql`${storeConnections.updatedAt}` })
    .where(
      and(
        eq(storeConnections.id, webhook.storeConnectionId),
        or(
          isNull(storeConnections.lastWebhookAt),
          lt(
            storeConnections.lastWebhookAt,
            sql`${timestampOf(webhook.receivedAt)} - ${WEBHOOK_STAMP_STEP}`,
          ),
        ),
      ),
    );
}

/** Keeps a connected store usable but shows why the last background call failed. */
export async function recordStoreError(
  database: Database,
  failure: { storeConnectionId: string; lastError: string; refreshTokenEnc: string },
): Promise<void> {
  // Only while the failed refresh token is still the saved one: a slow failure from before a
  // reconnection must not flag the new connection.
  await database
    .update(storeConnections)
    .set({ lastError: failure.lastError })
    .where(
      and(
        eq(storeConnections.id, failure.storeConnectionId),
        eq(storeConnections.status, "connected"),
        eq(storeConnections.refreshTokenEnc, failure.refreshTokenEnc),
      ),
    );
}

/** Connected stores whose access token expires before `threshold` (worker job, all tenants). */
/**
 * Connections whose token expires before `threshold`, soonest first and at most `limit` of them:
 * one run refreshes them one by one, and with thousands of stores (or a slow marketplace) an
 * unbounded run outlasted the 10 minutes until the next one. The rest come next run.
 */
export async function findConnectionsExpiringBefore(
  database: Database,
  threshold: Date,
  limit = 500,
): Promise<StoreConnectionRow[]> {
  return database
    .select()
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.status, "connected"),
        isNotNull(storeConnections.refreshTokenEnc),
        lt(storeConnections.expiresAt, threshold),
      ),
    )
    .orderBy(asc(storeConnections.expiresAt))
    .limit(limit);
}

export async function createOAuthState(
  database: Database,
  input: {
    state: string;
    tenantId: string;
    marketplace: Marketplace;
    codeVerifier: string | null;
    ttlMilliseconds: number;
    /** The supplier the shop connected with this state sells. */
    supplierId?: string | null;
  },
): Promise<void> {
  await database.insert(oauthStates).values({
    state: input.state,
    tenantId: input.tenantId,
    marketplace: input.marketplace,
    codeVerifier: input.codeVerifier,
    supplierId: input.supplierId ?? null,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  });
}

/** Resolve a pending callback only through a current membership of its signed-in user. */
export async function findOAuthStateProfile(
  database: Database,
  input: { state: string; marketplace: Marketplace; userId: string },
): Promise<string | null> {
  const [profile] = await database
    .select({ slug: organization.slug })
    .from(oauthStates)
    .innerJoin(organization, eq(organization.id, oauthStates.tenantId))
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, input.userId)),
    )
    .where(
      and(
        eq(oauthStates.state, input.state),
        eq(oauthStates.marketplace, input.marketplace),
        gt(oauthStates.expiresAt, new Date()),
      ),
    );
  return profile?.slug ?? null;
}

/**
 * Consumes (deletes) an OAuth state. Returns null when it does not exist, is expired,
 * belongs to another tenant or another marketplace, which protects the callback from CSRF and replay.
 */
export async function consumeOAuthState(
  database: Database,
  input: { state: string; tenantId: string; marketplace: Marketplace },
): Promise<{ codeVerifier: string | null; supplierId: string | null } | null> {
  const [row] = await database
    .delete(oauthStates)
    .where(eq(oauthStates.state, input.state))
    .returning();
  if (!row) {
    return null;
  }
  if (row.tenantId !== input.tenantId || row.marketplace !== input.marketplace) {
    return null;
  }
  // Expired at the exact instant too, like API keys and supplier links.
  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { codeVerifier: row.codeVerifier, supplierId: row.supplierId };
}
