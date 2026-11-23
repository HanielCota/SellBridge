import type { BillingRules } from "@sellbridge/shared/billing";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor, Transaction } from "../client.ts";
import {
  listingFamilies,
  listings,
  listingTargets,
  productModelColors,
  productModels,
  productModelSizes,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { assertBillingCapacity } from "./billing.ts";
import { listingIdempotencyKey } from "./listings.ts";
import { assertPrivateProductPublication } from "./private-product-publication.ts";
import { availableStock } from "./sql/available-stock.ts";
import { productWeightGrams } from "./sql/product-weight.ts";
import {
  catalogVisibleTo,
  productListable,
  supplierOpenToResellers,
  supplierReceivingRuleMet,
} from "./sql/sellable.ts";

export interface SellableCombination {
  id: string;
  sku: string;
  title: string;
  color: string | null;
  size: string | null;
  costCents: number;
  suggestedPriceCents: number;
  /** Units the supplier can ship now (stock minus reservations). */
  stock: number;
  imageUrls: string[];
  /** Net weight from the NF-e data, in grams; null when the supplier gave none. */
  weightGrams: number | null;
}

export interface SellableProductModel {
  id: string;
  title: string;
  description: string;
  supplierId: string;
  supplierName: string;
  catalogKind: "supplier" | "seller";
  /** The combinations a reseller may sell, in the order the buyer sees them. */
  combinations: SellableCombination[];
}

/** The model's combinations a reseller may sell, colours then sizes in the supplier's order. */
async function sellableCombinationRows(database: Database, tenantId: string, modelId: string) {
  return database
    .select({
      combination: {
        id: supplierProducts.id,
        sku: supplierProducts.sku,
        title: supplierProducts.title,
        color: supplierProducts.color,
        size: supplierProducts.size,
        costCents: supplierProducts.costCents,
        suggestedPriceCents: supplierProducts.suggestedPriceCents,
        stock: availableStock,
        imageUrls: supplierProducts.imageUrls,
        weightGrams: productWeightGrams,
      },
      model: {
        id: productModels.id,
        title: productModels.title,
        description: productModels.description,
      },
      supplier: { id: suppliers.id, name: suppliers.name, catalogKind: suppliers.catalogKind },
    })
    .from(supplierProducts)
    .innerJoin(productModels, eq(productModels.id, supplierProducts.modelId))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .leftJoin(
      productModelColors,
      and(
        eq(productModelColors.modelId, supplierProducts.modelId),
        eq(productModelColors.name, supplierProducts.color),
      ),
    )
    .leftJoin(
      productModelSizes,
      and(
        eq(productModelSizes.modelId, supplierProducts.modelId),
        eq(productModelSizes.name, supplierProducts.size),
      ),
    )
    .where(
      and(
        eq(supplierProducts.modelId, modelId),
        productListable(),
        supplierOpenToResellers(),
        supplierReceivingRuleMet(),
        catalogVisibleTo(tenantId),
      ),
    )
    .orderBy(
      sql`${productModelColors.position} asc nulls first`,
      sql`${productModelSizes.position} asc nulls first`,
      asc(supplierProducts.id),
    );
}

/**
 * A grid as the reseller may publish it: the model and its sellable combinations, colours and
 * sizes in the supplier's order. The same visibility rules as one catalog product apply.
 *
 * @throws AppError NOT_FOUND when the model is unknown, hidden from this tenant or has no
 *   combination on sale.
 */
export async function getSellableProductModel(
  database: Database,
  tenantId: string,
  modelId: string,
): Promise<SellableProductModel> {
  const rows = await sellableCombinationRows(database, tenantId, modelId);
  const [first] = rows;
  if (first === undefined) {
    throw notFoundError("Produto não encontrado no catálogo");
  }
  return {
    ...first.model,
    supplierId: first.supplier.id,
    supplierName: first.supplier.name,
    catalogKind: first.supplier.catalogKind,
    combinations: rows.map((row) => row.combination),
  };
}

export interface FamilyListingDraft {
  supplierProductId: string;
  title: string;
  description: string;
  priceCents: number;
}

export interface NewListingFamilyInput {
  modelId: string;
  /** Used only when the family is new: an existing family keeps the name its items carry. */
  familyName: string;
  listings: readonly FamilyListingDraft[];
  /** Plan limits to enforce; null where billing is off. */
  billing: BillingRules | null;
}

export interface SkippedCombination {
  supplierProductId: string;
  /** The stores where the combination already has a listing, so it stays out there. */
  storeNames: string[];
}

export interface CreatedListingFamily {
  familyId: string;
  targetIds: string[];
  /** Combinations that got a listing, with the stores they go to. */
  listed: { supplierProductId: string; listingId: string; storeConnectionIds: string[] }[];
  skipped: SkippedCombination[];
}

async function lockStores(
  transaction: Transaction,
  tenantId: string,
  storeConnectionIds: readonly string[],
) {
  return transaction
    .select({ id: storeConnections.id, name: storeConnections.shopName })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
      ),
    )
    .orderBy(asc(storeConnections.id))
    .for("update");
}

/** Each combination's stores that already carry a listing of it, by combination. */
async function storesAlreadyListing(
  transaction: Transaction,
  tenantId: string,
  productIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const rows = await transaction
    .selectDistinct({
      productId: listings.supplierProductId,
      storeId: listingTargets.storeConnectionId,
    })
    .from(listingTargets)
    .innerJoin(listings, eq(listings.id, listingTargets.listingId))
    .where(
      and(eq(listingTargets.tenantId, tenantId), inArray(listings.supplierProductId, productIds)),
    );
  const byProduct = new Map<string, Set<string>>();
  for (const row of rows) {
    const stores = byProduct.get(row.productId) ?? new Set<string>();
    stores.add(row.storeId);
    byProduct.set(row.productId, stores);
  }
  return byProduct;
}

/** Every draft must be a combination of the model; the model is held against separation. */
async function assertCombinationsOfModel(
  transaction: Transaction,
  modelId: string,
  productIds: readonly string[],
): Promise<void> {
  const [model] = await transaction
    .select({ id: productModels.id })
    .from(productModels)
    .where(eq(productModels.id, modelId))
    .for("key share");
  if (model === undefined) {
    throw notFoundError("Produto não encontrado no catálogo");
  }
  const combinations = await transaction
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(
      and(inArray(supplierProducts.id, [...productIds]), eq(supplierProducts.modelId, modelId)),
    );
  if (combinations.length !== new Set(productIds).size) {
    throw validationError("Uma das cores ou tamanhos escolhidos não é deste produto.");
  }
}

/** The tenant's family for the model, created on its first publication. */
async function familyFor(
  transaction: Transaction,
  tenantId: string,
  input: Pick<NewListingFamilyInput, "modelId" | "familyName">,
): Promise<string> {
  const [created] = await transaction
    .insert(listingFamilies)
    .values({ tenantId, modelId: input.modelId, name: input.familyName })
    .onConflictDoNothing({ target: [listingFamilies.tenantId, listingFamilies.modelId] })
    .returning({ id: listingFamilies.id });
  if (created !== undefined) {
    return created.id;
  }
  const [existing] = await transaction
    .select({ id: listingFamilies.id })
    .from(listingFamilies)
    .where(and(eq(listingFamilies.tenantId, tenantId), eq(listingFamilies.modelId, input.modelId)));
  if (existing === undefined) {
    throw new Error(`Listing family of model ${input.modelId} vanished after its insert conflict`);
  }
  return existing.id;
}

interface PlannedListing {
  draft: FamilyListingDraft;
  storeConnectionIds: string[];
}

/**
 * Splits the drafts by store: a combination that already has a listing in a store stays out of
 * the grid there (decision of 18/11/2026: never two listings of one product in a store).
 */
function planFamilyListings(
  drafts: readonly FamilyListingDraft[],
  stores: readonly { id: string; name: string }[],
  alreadyListing: ReadonlyMap<string, ReadonlySet<string>>,
): { planned: PlannedListing[]; skipped: SkippedCombination[] } {
  const planned: PlannedListing[] = [];
  const skipped: SkippedCombination[] = [];
  for (const draft of drafts) {
    const listedIn = alreadyListing.get(draft.supplierProductId) ?? new Set<string>();
    const free = stores.filter((store) => !listedIn.has(store.id));
    const taken = stores.filter((store) => listedIn.has(store.id));
    if (taken.length > 0) {
      skipped.push({
        supplierProductId: draft.supplierProductId,
        storeNames: taken.map((store) => store.name),
      });
    }
    if (free.length > 0) {
      planned.push({ draft, storeConnectionIds: free.map((store) => store.id) });
    }
  }
  return { planned, skipped };
}

async function insertFamilyListing(
  transaction: Transaction,
  input: { tenantId: string; familyId: string; planned: PlannedListing },
) {
  const { tenantId, familyId, planned } = input;
  const [listing] = await transaction
    .insert(listings)
    .values({ ...planned.draft, tenantId, familyId })
    .returning({ id: listings.id });
  if (listing === undefined) {
    throw conflictError("Não foi possível criar o anúncio");
  }
  const targets = await transaction
    .insert(listingTargets)
    .values(
      planned.storeConnectionIds.map((storeConnectionId) => ({
        tenantId,
        listingId: listing.id,
        storeConnectionId,
        idempotencyKey: listingIdempotencyKey(listing.id, storeConnectionId),
      })),
    )
    .returning({ id: listingTargets.id });
  return { listingId: listing.id, targetIds: targets.map((target) => target.id) };
}

/**
 * Publishes a grid on the tenant's stores in one transaction: one ordinary listing per
 * combination, all in the tenant's family of the model (created on the first publication). A
 * combination already listed in a store stays out of that store and is reported as skipped.
 * The plan counts one slot per combination and store.
 *
 * @throws AppError VALIDATION when no store or combination is given, or a combination is not
 *   the model's; CONFLICT when every combination is already listed in every chosen store;
 *   NOT_FOUND when the model is gone; FORBIDDEN when the plan has no room.
 */
export async function createListingFamilyWithListings(
  database: Database,
  tenantId: string,
  input: NewListingFamilyInput,
  storeConnectionIds: readonly string[],
): Promise<CreatedListingFamily> {
  if (storeConnectionIds.length === 0) {
    throw validationError("Escolha ao menos uma loja de destino");
  }
  if (input.listings.length === 0) {
    throw validationError("Escolha ao menos uma cor ou tamanho para publicar");
  }
  const productIds = input.listings.map((draft) => draft.supplierProductId);
  return database.transaction(async (transaction) => {
    const stores = await lockStores(transaction, tenantId, storeConnectionIds);
    if (stores.length !== new Set(storeConnectionIds).size) {
      throw notFoundError("Uma ou mais lojas escolhidas não estão mais disponíveis.");
    }
    const alreadyListing = await storesAlreadyListing(transaction, tenantId, productIds);
    const { planned, skipped } = planFamilyListings(input.listings, stores, alreadyListing);
    if (planned.length === 0) {
      throw conflictError(
        "Todas as cores e tamanhos escolhidos já estão publicados nessas lojas. Veja em Publicações.",
      );
    }
    for (const { draft, storeConnectionIds: storeIds } of planned) {
      await assertPrivateProductPublication(
        transaction,
        tenantId,
        draft.supplierProductId,
        storeIds,
      );
    }
    await assertCombinationsOfModel(transaction, input.modelId, productIds);
    if (input.billing !== null) {
      await assertBillingCapacity(transaction, {
        tenantId,
        rules: input.billing,
        resource: "listings",
        requested: planned.reduce((total, item) => total + item.storeConnectionIds.length, 0),
      });
    }
    const familyId = await familyFor(transaction, tenantId, input);
    const listed: CreatedListingFamily["listed"] = [];
    const targetIds: string[] = [];
    for (const item of planned) {
      const created = await insertFamilyListing(transaction, { tenantId, familyId, planned: item });
      listed.push({
        supplierProductId: item.draft.supplierProductId,
        listingId: created.listingId,
        storeConnectionIds: item.storeConnectionIds,
      });
      targetIds.push(...created.targetIds);
    }
    return { familyId, targetIds, listed, skipped };
  });
}

/** Whether any reseller sells the grid as a family of its own (it can no longer be separated). */
export async function modelHasListingFamily(
  executor: DatabaseExecutor,
  modelId: string,
): Promise<boolean> {
  const [family] = await executor
    .select({ id: listingFamilies.id })
    .from(listingFamilies)
    .where(eq(listingFamilies.modelId, modelId))
    .limit(1);
  return family !== undefined;
}
