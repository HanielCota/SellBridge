import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { marketplaceFeeQuotes, storeConnections, supplierProducts } from "../schema/index.ts";
import { productWeightGrams } from "./sql/product-weight.ts";

/** A connected Mercado Livre store whose account can be asked for its sale costs. */
export interface MercadoLivreFeeAccess {
  storeConnectionId: string;
  externalShopId: string;
  /** Still encrypted: the caller decrypts it right before the request. */
  accessTokenEnc: string;
}

/**
 * The tenant's stores among `storeIds` that are connected Mercado Livre accounts with a usable
 * token. Other marketplaces, disconnected stores and other tenants' stores are left out.
 */
export async function findMercadoLivreFeeAccess(
  database: Database,
  tenantId: string,
  storeIds: readonly string[],
  now: Date,
): Promise<MercadoLivreFeeAccess[]> {
  if (storeIds.length === 0) {
    return [];
  }
  const rows = await database
    .select({
      storeConnectionId: storeConnections.id,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
    })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeIds]),
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.status, "connected"),
        isNotNull(storeConnections.accessTokenEnc),
        or(isNull(storeConnections.expiresAt), gt(storeConnections.expiresAt, now)),
      ),
    );
  return rows.flatMap((row) =>
    row.accessTokenEnc === null ? [] : [{ ...row, accessTokenEnc: row.accessTokenEnc }],
  );
}

/** What Mercado Livre needs to quote a product's sale costs. */
export interface ProductFeeProfile {
  /** Mercado Livre category the supplier chose; null when none was chosen yet. */
  categoryId: string | null;
  /** The product's Mercado Livre fields, where the package measures live. */
  attributes: Record<string, string>;
  /** The weight shipping is priced on (packed, else net), in grams; null when the supplier gave none. */
  weightGrams: number | null;
}

export async function findProductFeeProfile(
  database: Database,
  productId: string,
): Promise<ProductFeeProfile | null> {
  const [row] = await database
    .select({
      categoryId: supplierProducts.mercadoLivreCategoryId,
      attributes: supplierProducts.mercadoLivreAttributes,
      weightGrams: productWeightGrams,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId))
    .limit(1);
  return row ?? null;
}

export interface FeeQuote {
  /** Basis points for a commission, cents for a shipping cost. */
  amount: number;
  readAt: Date;
}

/** The store's saved answers for the keys, in one query; a key never asked is absent. */
export async function findFeeQuotes(
  database: Database,
  storeConnectionId: string,
  quoteKeys: readonly string[],
): Promise<Map<string, FeeQuote>> {
  if (quoteKeys.length === 0) {
    return new Map();
  }
  const rows = await database
    .select({
      quoteKey: marketplaceFeeQuotes.quoteKey,
      amount: marketplaceFeeQuotes.amount,
      readAt: marketplaceFeeQuotes.readAt,
    })
    .from(marketplaceFeeQuotes)
    .where(
      and(
        eq(marketplaceFeeQuotes.storeConnectionId, storeConnectionId),
        inArray(marketplaceFeeQuotes.quoteKey, [...quoteKeys]),
      ),
    );
  return new Map(rows.map((row) => [row.quoteKey, { amount: row.amount, readAt: row.readAt }]));
}

/** Keeps the store's latest answers, replacing what was saved for the same keys. */
export async function saveFeeQuotes(
  database: Database,
  storeConnectionId: string,
  quotes: readonly ({ quoteKey: string } & FeeQuote)[],
): Promise<void> {
  if (quotes.length === 0) {
    return;
  }
  await database
    .insert(marketplaceFeeQuotes)
    .values(quotes.map((quote) => ({ storeConnectionId, ...quote })))
    .onConflictDoUpdate({
      target: [marketplaceFeeQuotes.storeConnectionId, marketplaceFeeQuotes.quoteKey],
      set: { amount: sql`excluded.amount`, readAt: sql`excluded.read_at` },
    });
}
