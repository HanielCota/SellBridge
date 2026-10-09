import { ConflictError, NotFoundError } from "@sellbridge/shared/errors";
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
  db: Database,
  tenantId: string,
): Promise<StoreConnectionSummary[]> {
  return db
    .select(summaryColumns)
    .from(storeConnections)
    .where(
      and(eq(storeConnections.tenantId, tenantId), ne(storeConnections.status, "disconnected")),
    )
    .orderBy(asc(storeConnections.connectedAt));
}

export async function getStoreConnection(
  db: Database,
  tenantId: string,
  storeConnectionId: string,
): Promise<StoreConnectionRow> {
  const row = await db.query.storeConnections.findFirst({
    where: and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.id, storeConnectionId)),
  });
  if (!row) {
    throw new NotFoundError("Loja não encontrada");
  }
  return row;
}

/** Returns only the requested stores that belong to the tenant and are connected. */
export async function findConnectedStores(
  db: Database,
  tenantId: string,
  storeConnectionIds: readonly string[],
): Promise<StoreConnectionSummary[]> {
  if (storeConnectionIds.length === 0) {
    return [];
  }
  return db
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
  db: Database,
  input: UpsertStoreConnectionInput,
): Promise<StoreConnectionSummary> {
  const values = { ...input, status: "connected" as const, lastError: null };
  const [row] = await db
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
    throw new ConflictError("Não foi possível salvar a conexão da loja");
  }
  return row;
}

export async function disconnectStore(
  db: Database,
  tenantId: string,
  storeConnectionId: string,
): Promise<void> {
  const [row] = await db
    .update(storeConnections)
    .set({ status: "disconnected", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null })
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.id, storeConnectionId)))
    .returning({ id: storeConnections.id });
  if (!row) {
    throw new NotFoundError("Loja não encontrada");
  }
}

export async function updateStoreTokens(
  db: Database,
  storeConnectionId: string,
  tokens: { accessTokenEnc: string; refreshTokenEnc: string | null; expiresAt: Date | null },
): Promise<void> {
  await db
    .update(storeConnections)
    .set({ ...tokens, status: "connected", lastError: null })
    .where(eq(storeConnections.id, storeConnectionId));
}

export async function markStoreStatus(
  db: Database,
  storeConnectionId: string,
  status: Exclude<StoreStatus, "connected">,
  lastError: string,
): Promise<void> {
  await db
    .update(storeConnections)
    .set({ status, lastError })
    .where(eq(storeConnections.id, storeConnectionId));
}

/** Connected stores whose access token expires before `threshold` (worker job, all tenants). */
export async function findConnectionsExpiringBefore(
  db: Database,
  threshold: Date,
): Promise<StoreConnectionRow[]> {
  return db
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
  db: Database,
  input: {
    state: string;
    tenantId: string;
    marketplace: Marketplace;
    codeVerifier: string | null;
    ttlMs: number;
  },
): Promise<void> {
  await db.insert(oauthStates).values({
    state: input.state,
    tenantId: input.tenantId,
    marketplace: input.marketplace,
    codeVerifier: input.codeVerifier,
    expiresAt: new Date(Date.now() + input.ttlMs),
  });
}

/**
 * Consumes (deletes) an OAuth state. Returns null when it does not exist, is expired,
 * belongs to another tenant or another marketplace — protecting the callback from CSRF and replay.
 */
export async function consumeOAuthState(
  db: Database,
  input: { state: string; tenantId: string; marketplace: Marketplace },
): Promise<{ codeVerifier: string | null } | null> {
  const [row] = await db.delete(oauthStates).where(eq(oauthStates.state, input.state)).returning();
  if (!row) {
    return null;
  }
  if (row.tenantId !== input.tenantId || row.marketplace !== input.marketplace) {
    return null;
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return { codeVerifier: row.codeVerifier };
}
