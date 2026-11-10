import { and, asc, eq, gt, isNotNull, lt } from "drizzle-orm";
import type { Database } from "../client.ts";
import { erpOAuthStates, supplierErpConnections, supplierProducts } from "../schema/index.ts";

type ErpConnectionRow = typeof supplierErpConnections.$inferSelect;
export type ErpProvider = ErpConnectionRow["provider"];
export type ErpConnection = ErpConnectionRow;

export interface ErpTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
}

/** A one-time state for the ERP consent page; it remembers who asked and for which supplier. */
export async function createErpOAuthState(
  database: Database,
  input: {
    state: string;
    supplierId: string;
    userId: string;
    provider: ErpProvider;
    ttlMilliseconds: number;
  },
): Promise<void> {
  await database.insert(erpOAuthStates).values({
    state: input.state,
    supplierId: input.supplierId,
    userId: input.userId,
    provider: input.provider,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  });
}

/**
 * Deletes the state and returns its supplier, only for the same user and provider and before it
 * expires: a state is good for one callback, from the person who started it.
 */
export async function consumeErpOAuthState(
  database: Database,
  input: { state: string; userId: string; provider: ErpProvider },
): Promise<{ supplierId: string } | null> {
  const [row] = await database
    .delete(erpOAuthStates)
    .where(and(eq(erpOAuthStates.state, input.state), eq(erpOAuthStates.provider, input.provider)))
    .returning();
  if (row === undefined) {
    return null;
  }
  if (row.userId !== input.userId) {
    return null;
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { supplierId: row.supplierId };
}

/** Saves the supplier's ERP account as connected; reconnecting replaces the old tokens. */
export async function upsertErpConnection(
  database: Database,
  input: { supplierId: string; provider: ErpProvider; userId: string | null; tokens: ErpTokens },
): Promise<ErpConnection> {
  const values = {
    ...input.tokens,
    status: "connected" as const,
    lastError: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
  };
  const [row] = await database
    .insert(supplierErpConnections)
    .values({ supplierId: input.supplierId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [supplierErpConnections.supplierId, supplierErpConnections.provider],
      set: values,
    })
    .returning();
  if (row === undefined) {
    throw new Error(`ERP connection not saved for supplier ${input.supplierId}`);
  }
  return row;
}

export async function findErpConnection(
  database: Database,
  input: { supplierId: string; provider: ErpProvider },
): Promise<ErpConnection | null> {
  const [row] = await database
    .select()
    .from(supplierErpConnections)
    .where(
      and(
        eq(supplierErpConnections.supplierId, input.supplierId),
        eq(supplierErpConnections.provider, input.provider),
      ),
    );
  return row ?? null;
}

/**
 * Swaps the tokens only while the connection is connected and still holds the refresh token the
 * caller used: a reconnection or a parallel refresh in between wins, and this one is dropped.
 */
export async function rotateErpTokens(
  database: Database,
  input: { connectionId: string; previousRefreshTokenEnc: string; tokens: ErpTokens },
): Promise<boolean> {
  const updated = await database
    .update(supplierErpConnections)
    .set({ ...input.tokens, lastError: null })
    .where(
      and(
        eq(supplierErpConnections.id, input.connectionId),
        eq(supplierErpConnections.status, "connected"),
        eq(supplierErpConnections.refreshTokenEnc, input.previousRefreshTokenEnc),
      ),
    )
    .returning({ id: supplierErpConnections.id });
  return updated.length > 0;
}

/**
 * Marks the connection expired (the ERP refused the refresh token) or records a passing error,
 * again only while the failed refresh token is still the saved one.
 */
export async function recordErpRefreshFailure(
  database: Database,
  input: {
    connectionId: string;
    refreshTokenEnc: string;
    lastError: string;
    expired: boolean;
  },
): Promise<boolean> {
  const updated = await database
    .update(supplierErpConnections)
    .set(
      input.expired
        ? { status: "expired", lastError: input.lastError }
        : { lastError: input.lastError },
    )
    .where(
      and(
        eq(supplierErpConnections.id, input.connectionId),
        eq(supplierErpConnections.status, "connected"),
        eq(supplierErpConnections.refreshTokenEnc, input.refreshTokenEnc),
      ),
    )
    .returning({ id: supplierErpConnections.id });
  return updated.length > 0;
}

/** Connected ERP accounts whose access token expires before `threshold`, soonest first. */
export async function findErpConnectionsExpiringBefore(
  database: Database,
  threshold: Date,
  limit = 500,
): Promise<ErpConnection[]> {
  return database
    .select()
    .from(supplierErpConnections)
    .where(
      and(
        eq(supplierErpConnections.status, "connected"),
        isNotNull(supplierErpConnections.refreshTokenEnc),
        lt(supplierErpConnections.expiresAt, threshold),
      ),
    )
    .orderBy(asc(supplierErpConnections.expiresAt))
    .limit(limit);
}

export interface CatalogExportProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  costCents: number;
  imageUrls: string[];
  attributes: Record<string, string>;
}

/**
 * A page of the supplier's active products for sending to its ERP, by id order (cursor), so a
 * large catalog is read in fixed-size pages.
 */
export async function listSupplierProductsForErpExport(
  database: Database,
  input: { supplierId: string; afterId: string | null; limit: number },
): Promise<CatalogExportProduct[]> {
  const conditions = [
    eq(supplierProducts.supplierId, input.supplierId),
    eq(supplierProducts.active, true),
  ];
  if (input.afterId !== null) {
    conditions.push(gt(supplierProducts.id, input.afterId));
  }
  return database
    .select({
      id: supplierProducts.id,
      sku: supplierProducts.sku,
      title: supplierProducts.title,
      description: supplierProducts.description,
      costCents: supplierProducts.costCents,
      imageUrls: supplierProducts.imageUrls,
      attributes: supplierProducts.mercadoLivreAttributes,
    })
    .from(supplierProducts)
    .where(and(...conditions))
    .orderBy(asc(supplierProducts.id))
    .limit(input.limit);
}
