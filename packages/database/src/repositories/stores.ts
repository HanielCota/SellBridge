import { assertBillingCapacity, lockBillingTenant } from "./billing.ts";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { and, asc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import type { Database } from "../client.ts";
import { oauthStates, storeConnections } from "../schema/index.ts";

type StoreConnectionRow = typeof storeConnections.$inferSelect;
export type Marketplace = StoreConnectionRow["marketplace"];
export type StoreStatus = StoreConnectionRow["status"];

export interface StoreConnectionSummary {
  id: string;
  marketplace: Marketplace;
  shopName: string;
  externalShopId: string;
  status: StoreStatus;
  lastError: string | null;
  expiresAt: Date | null;
  connectedAt: Date;
}

const summaryColumns = {
  id: storeConnections.id,
  marketplace: storeConnections.marketplace,
  shopName: storeConnections.shopName,
  externalShopId: storeConnections.externalShopId,
  status: storeConnections.status,
  lastError: storeConnections.lastError,
  expiresAt: storeConnections.expiresAt,
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
}

/** Connecting the same shop again reactivates it with fresh tokens. */
export async function upsertStoreConnection(
  database: Database,
  input: UpsertStoreConnectionInput,
): Promise<StoreConnectionSummary> {
  return database.transaction(async (executor) => {
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
    const { billingEnabled: _billingEnabled, ...connection } = input;
    const values = { ...connection, status: "connected" as const, lastError: null };
    const [row] = await executor
      .insert(storeConnections)
      .values({ ...values, connectedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          storeConnections.tenantId,
          storeConnections.marketplace,
          storeConnections.externalShopId,
        ],
        set: values,
      })
      .returning(summaryColumns);
    if (!row) {
      throw conflictError("Não foi possível salvar a conexão da loja");
    }
    return row;
  });
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
  const updated = await database
    .update(storeConnections)
    .set({ status: change.status, lastError: change.lastError })
    .where(and(...conditions))
    .returning({ id: storeConnections.id });
  return updated.length > 0;
}

/** Keeps a connected store usable but shows why the last background call failed. */
export async function recordStoreError(
  database: Database,
  storeConnectionId: string,
  lastError: string,
): Promise<void> {
  await database
    .update(storeConnections)
    .set({ lastError })
    .where(
      and(eq(storeConnections.id, storeConnectionId), eq(storeConnections.status, "connected")),
    );
}

/** Connected stores whose access token expires before `threshold` (worker job, all tenants). */
export async function findConnectionsExpiringBefore(
  database: Database,
  threshold: Date,
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
    );
}

export async function createOAuthState(
  database: Database,
  input: {
    state: string;
    tenantId: string;
    marketplace: Marketplace;
    codeVerifier: string | null;
    ttlMilliseconds: number;
  },
): Promise<void> {
  await database.insert(oauthStates).values({
    state: input.state,
    tenantId: input.tenantId,
    marketplace: input.marketplace,
    codeVerifier: input.codeVerifier,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  });
}

/**
 * Consumes (deletes) an OAuth state. Returns null when it does not exist, is expired,
 * belongs to another tenant or another marketplace, which protects the callback from CSRF and replay.
 */
export async function consumeOAuthState(
  database: Database,
  input: { state: string; tenantId: string; marketplace: Marketplace },
): Promise<{ codeVerifier: string | null } | null> {
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
  return { codeVerifier: row.codeVerifier };
}
