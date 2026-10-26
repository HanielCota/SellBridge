import { randomUUID } from "node:crypto";
import type { Database } from "@sellbridge/database/client";
import {
  createListingWithTargets,
  markTargetPublished,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { requireEnvironmentVariable } from "./environment";
import {
  listings,
  member,
  orders,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";

/**
 * A product resellers can order and forward: active and approved, from an active supplier of the
 * public catalog. The shared database also holds products and suppliers other tests switched
 * off, and taking "the first product" picked one of those, whose order could not be forwarded.
 */
export async function forwardableProduct(database: Database) {
  const [listed] = await database
    .select({ product: supplierProducts })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(supplierProducts.active, true),
        eq(supplierProducts.reviewStatus, "approved"),
        eq(suppliers.active, true),
        eq(suppliers.catalogKind, "supplier"),
      ),
    )
    .limit(1);
  return listed?.product;
}

async function tenantOf(database: Database, email: string): Promise<string> {
  const [account] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (account === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  return account.tenantId;
}

/**
 * A live listing the store's catalog shows with stock, made whole by the spec: a public supplier,
 * a connected mock store of the account that sells it (the catalog shows only the store's
 * supplier, MVP function 1), a product with units left, and its published listing. The shared
 * demo account's stores have no supplier, so nothing of its own data could be used. `remove`
 * deletes all of it, the orders sold on that store included.
 */
export async function ownSellableListing(database: Database, email: string) {
  const tenantId = await tenantOf(database, email);
  const stamp = randomUUID().slice(0, 8);
  const title = `Luminária estoque E2E ${stamp}`;
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Fornecedor estoque E2E ${stamp}`, niche: "Casa", state: "SP", city: "Teste" })
    .returning();
  if (supplier === undefined) {
    throw new Error("fornecedor de teste não criado");
  }
  const supplierId = supplier.id;
  // Real ciphertexts: the worker decrypts the store's tokens before it imports a sale.
  const cipher = createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY"));
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, `stock-e2e-${stamp}`),
    marketplace: "mercado_livre",
    accessTokenEnc: cipher.encrypt("mock-access-token"),
    refreshTokenEnc: cipher.encrypt("mock-refresh-token"),
    supplierId,
  });
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `STOCK-E2E-${stamp}`,
      title,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 50,
    })
    .returning();
  if (product === undefined) {
    throw new Error("produto de teste não criado");
  }
  const created = await createListingWithTargets(
    database,
    tenantId,
    { supplierProductId: product.id, title, description: "Produto de teste", priceCents: 4990 },
    [store.id],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("anúncio de teste não criado");
  }
  await markTargetPublished(database, targetId, {
    externalId: `E2E-STOCK-${stamp}`,
    externalUrl: null,
  });
  const productId = product.id;
  async function remove(): Promise<void> {
    // The simulated sales went to this spec's own store, so its orders are the spec's too.
    await database.delete(orders).where(eq(orders.storeConnectionId, store.id));
    await database.delete(listings).where(eq(listings.supplierProductId, productId));
    await database.delete(storeConnections).where(eq(storeConnections.id, store.id));
    await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  }
  return { title, storeId: store.id, remove };
}
