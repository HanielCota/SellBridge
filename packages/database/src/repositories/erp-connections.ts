import { and, asc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  erpCatalogReads,
  erpOAuthStates,
  supplierErpConnections,
  supplierProducts,
} from "../schema/index.ts";

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
  input: {
    supplierId: string;
    provider: ErpProvider;
    userId: string | null;
    tokens: ErpTokens;
    accountName?: string | null;
  },
): Promise<ErpConnection> {
  const values = {
    ...input.tokens,
    accountName: input.accountName ?? null,
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

/**
 * What the reseller pays today for the supplier's products with these SKUs, by SKU. An ERP
 * import keeps these costs: the ERP price is only a suggestion.
 */
export async function findSupplierProductCostsBySku(
  database: Database,
  input: { supplierId: string; skus: readonly string[] },
): Promise<Map<string, number>> {
  if (input.skus.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({ sku: supplierProducts.sku, costCents: supplierProducts.costCents })
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, input.supplierId),
        inArray(supplierProducts.sku, [...input.skus]),
      ),
    );
  return new Map(rows.map((row) => [row.sku, row.costCents]));
}

export interface CatalogExportProduct {
  id: string;
  sku: string;
  title: string;
  description: string;
  costCents: number;
  /** The retail price the supplier suggests to resellers; it becomes the ERP's sale price. */
  suggestedPriceCents: number;
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
      suggestedPriceCents: supplierProducts.suggestedPriceCents,
      imageUrls: supplierProducts.imageUrls,
      attributes: supplierProducts.mercadoLivreAttributes,
    })
    .from(supplierProducts)
    .where(and(...conditions))
    .orderBy(asc(supplierProducts.id))
    .limit(input.limit);
}

type ErpCatalogReadRow = typeof erpCatalogReads.$inferSelect;
export type ErpCatalogRead = ErpCatalogReadRow;

/**
 * Starts a new read of the supplier's ERP catalog, replacing the previous one. The row gets a new
 * id, so a job still running for the old read can no longer write into this one.
 */
export async function startErpCatalogRead(
  database: Database,
  input: { supplierId: string; provider: ErpProvider; ttlMilliseconds: number },
): Promise<ErpCatalogRead> {
  const values = {
    id: crypto.randomUUID(),
    status: "reading" as const,
    totalProducts: null,
    readProducts: 0,
    result: null,
    error: null,
    startedAt: new Date(),
    finishedAt: null,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  };
  const [row] = await database
    .insert(erpCatalogReads)
    .values({ supplierId: input.supplierId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [erpCatalogReads.supplierId, erpCatalogReads.provider],
      set: values,
    })
    .returning();
  if (row === undefined) {
    throw new Error(`ERP catalog read not started for supplier ${input.supplierId}`);
  }
  return row;
}

function whileReading(readId: string) {
  return and(eq(erpCatalogReads.id, readId), eq(erpCatalogReads.status, "reading"));
}

/** How far the read got; ignored once the read finished or was replaced. */
export async function recordErpCatalogReadProgress(
  database: Database,
  input: { readId: string; readProducts: number; totalProducts: number },
): Promise<void> {
  await database
    .update(erpCatalogReads)
    .set({ readProducts: input.readProducts, totalProducts: input.totalProducts })
    .where(whileReading(input.readId));
}

/** Stores what was read; false when the read was replaced or already over. */
export async function finishErpCatalogRead(
  database: Database,
  input: { readId: string; result: unknown },
): Promise<boolean> {
  const updated = await database
    .update(erpCatalogReads)
    .set({ status: "ready", result: input.result, finishedAt: new Date() })
    .where(whileReading(input.readId))
    .returning({ id: erpCatalogReads.id });
  return updated.length > 0;
}

/** Ends the read with a short reason for the supplier. */
export async function failErpCatalogRead(
  database: Database,
  input: { readId: string; error: string },
): Promise<boolean> {
  const updated = await database
    .update(erpCatalogReads)
    .set({ status: "failed", error: input.error, finishedAt: new Date() })
    .where(whileReading(input.readId))
    .returning({ id: erpCatalogReads.id });
  return updated.length > 0;
}

/** The supplier's latest catalog read, or null when there is none or it expired. */
export async function findErpCatalogRead(
  database: Database,
  input: { supplierId: string; provider: ErpProvider },
): Promise<ErpCatalogRead | null> {
  const [row] = await database
    .select()
    .from(erpCatalogReads)
    .where(
      and(
        eq(erpCatalogReads.supplierId, input.supplierId),
        eq(erpCatalogReads.provider, input.provider),
        gt(erpCatalogReads.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

export async function deleteErpCatalogRead(
  database: DatabaseExecutor,
  input: { supplierId: string; provider: ErpProvider },
): Promise<void> {
  await database
    .delete(erpCatalogReads)
    .where(
      and(
        eq(erpCatalogReads.supplierId, input.supplierId),
        eq(erpCatalogReads.provider, input.provider),
      ),
    );
}

function connectionOf(input: { supplierId: string; provider: ErpProvider }) {
  return and(
    eq(supplierErpConnections.supplierId, input.supplierId),
    eq(supplierErpConnections.provider, input.provider),
  );
}

/**
 * Records an import from the ERP: when it happened and the discount rule used for new products
 * (tenths of a percent), remembered for the next import. The read it came from is cleared.
 */
export async function recordErpImport(
  database: Database,
  input: { supplierId: string; provider: ErpProvider; resellerDiscountTenths: number | null },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const set =
      input.resellerDiscountTenths === null
        ? { lastImportAt: new Date() }
        : { lastImportAt: new Date(), resellerDiscountTenths: input.resellerDiscountTenths };
    await transaction.update(supplierErpConnections).set(set).where(connectionOf(input));
    await deleteErpCatalogRead(transaction, input);
  });
}

/** Forgets the supplier's ERP account and its catalog read; true when there was one. */
export async function deleteErpConnection(
  database: Database,
  input: { supplierId: string; provider: ErpProvider },
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    await deleteErpCatalogRead(transaction, input);
    const deleted = await transaction
      .delete(supplierErpConnections)
      .where(connectionOf(input))
      .returning({ id: supplierErpConnections.id });
    return deleted.length > 0;
  });
}
