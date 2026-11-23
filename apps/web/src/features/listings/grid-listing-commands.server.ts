import { billingRules } from "@/features/billing/billing-config.server";
import {
  createListingFamilyWithListings,
  getSellableProductModel,
  type SellableCombination,
  type SellableProductModel,
  type SkippedCombination,
} from "@sellbridge/database/repositories";
import { isOutOfStock } from "@sellbridge/shared/bulk-publish-plan";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { assertBatchKeepsMargin, type PricedProduct } from "@sellbridge/shared/fee-model";
import { logger } from "@sellbridge/shared/logger";
import {
  type CreateGridListingInput,
  fitListingTitle,
  listingTitleSchema,
} from "@sellbridge/shared/schemas";
import { feeScheduleFrom } from "@/features/reports/fee-schedule";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { productGridEnabled } from "@/lib/server/product-grid-switch";
import { type DraftOverrides, resolveListingDraft } from "./listing-draft";
import { readMercadoLivreRates } from "./mercado-livre-rates.server";
import {
  assertConnectedStores,
  assertStoresSellSuppliers,
  enqueueTargets,
} from "./publish-listing.server";

export type CreateGridListingCommand = Omit<CreateGridListingInput, "combinationPrices"> & {
  combinationPrices?: CreateGridListingInput["combinationPrices"] | undefined;
};

/** Why a chosen combination did not get a listing on some store. */
export type GridSkipReason =
  { kind: "out_of_stock" } | { kind: "already_listed"; storeNames: string[] };

export interface GridListingOutcome {
  familyId: string;
  /** Combinations that got a listing on at least one store. */
  published: number;
  skipped: { supplierProductId: string; title: string; reason: GridSkipReason }[];
  targetIds: string[];
}

function chosenCombinations(
  model: SellableProductModel,
  supplierProductIds: readonly string[],
): SellableCombination[] {
  const byId = new Map(model.combinations.map((combination) => [combination.id, combination]));
  return [...new Set(supplierProductIds)].map((id) => {
    const combination = byId.get(id);
    if (combination === undefined) {
      throw validationError(
        "Uma das cores ou tamanhos escolhidos não está mais à venda. Atualize a página.",
      );
    }
    return combination;
  });
}

/** Each combination's listing: the grid's description and its own name and price. */
function combinationDrafts(
  model: SellableProductModel,
  combinations: readonly SellableCombination[],
  command: CreateGridListingCommand,
) {
  const ownPrice = new Map(
    (command.combinationPrices ?? []).map((price) => [price.supplierProductId, price.priceCents]),
  );
  return combinations.map((combination) => {
    const overrides: DraftOverrides = {
      description: command.description,
      priceCents: ownPrice.get(combination.id) ?? command.priceCents,
    };
    return resolveListingDraft({ ...combination, description: model.description }, overrides);
  });
}

/** Mercado Livre's live costs for each combination, read one at a time (each asks per store). */
async function pricedCombinations(
  tenantId: string,
  drafts: readonly { supplierProductId: string; title: string; priceCents: number }[],
  input: { combinations: ReadonlyMap<string, SellableCombination>; storeIds: readonly string[] },
): Promise<PricedProduct[]> {
  const priced: PricedProduct[] = [];
  for (const draft of drafts) {
    const combination = input.combinations.get(draft.supplierProductId);
    if (combination === undefined) {
      throw new Error(`Combination ${draft.supplierProductId} missing from its own draft list`);
    }
    const live = await readMercadoLivreRates(tenantId, {
      productId: combination.id,
      storeIds: input.storeIds,
    });
    priced.push({
      title: draft.title,
      priceCents: draft.priceCents,
      costCents: combination.costCents,
      weightGrams: combination.weightGrams,
      mercadoLivreRates: live?.rates ?? null,
    });
  }
  return priced;
}

/** The name Mercado Livre groups the items by: the typed one, else the grid's title cut to fit. */
function familyNameOf(model: SellableProductModel, command: CreateGridListingCommand): string {
  const parsed = listingTitleSchema.safeParse(command.familyName ?? fitListingTitle(model.title));
  if (!parsed.success) {
    throw validationError("O nome do produto não serve como título do anúncio; informe um título");
  }
  return parsed.data;
}

function skippedOutcome(
  combinations: ReadonlyMap<string, SellableCombination>,
  outOfStock: readonly SellableCombination[],
  alreadyListed: readonly SkippedCombination[],
): GridListingOutcome["skipped"] {
  return [
    ...outOfStock.map((combination) => ({
      supplierProductId: combination.id,
      title: combination.title,
      reason: { kind: "out_of_stock" } as const,
    })),
    ...alreadyListed.map((skipped) => ({
      supplierProductId: skipped.supplierProductId,
      title: combinations.get(skipped.supplierProductId)?.title ?? "",
      reason: { kind: "already_listed", storeNames: skipped.storeNames } as const,
    })),
  ];
}

/**
 * Publishes a colour and size grid on the tenant's stores, by the rules of one listing at a
 * time: every combination must ship now, keep the fee floor on each store's marketplace and
 * not be listed in that store already. Each combination becomes its own listing; Mercado Livre
 * shows them on one page through the family name. Combinations out of stock or already listed
 * in a store stay out and are reported.
 *
 * @throws AppError NOT_FOUND while grids are off or the grid is hidden; VALIDATION for a
 *   combination not on sale; CONFLICT when nothing is left to publish or a price loses money.
 */
export async function createGridListingForTenant(
  tenantId: string,
  command: CreateGridListingCommand,
): Promise<GridListingOutcome> {
  if (!productGridEnabled()) {
    throw notFoundError("Produto não encontrado no catálogo");
  }
  const model = await getSellableProductModel(database, tenantId, command.modelId);
  const chosen = chosenCombinations(model, command.supplierProductIds);
  const outOfStock = chosen.filter((combination) =>
    isOutOfStock(combination.stock, environment.STOCK_SAFETY_UNITS),
  );
  const inStock = chosen.filter((combination) => !outOfStock.includes(combination));
  if (inStock.length === 0) {
    throw conflictError(
      "As cores e tamanhos escolhidos estão sem estoque. Escolha outros ou espere o fornecedor repor.",
    );
  }
  const drafts = combinationDrafts(model, inStock, command);
  const { storeIds, channels } = await assertConnectedStores(tenantId, command.storeConnectionIds);
  await assertStoresSellSuppliers(tenantId, storeIds, [model.supplierId]);
  const combinations = new Map(
    model.combinations.map((combination) => [combination.id, combination]),
  );
  assertBatchKeepsMargin(
    await pricedCombinations(tenantId, drafts, { combinations, storeIds }),
    feeScheduleFrom(environment),
    channels,
  );
  const created = await createListingFamilyWithListings(
    database,
    tenantId,
    {
      modelId: model.id,
      familyName: familyNameOf(model, command),
      listings: drafts,
      billing: billingRules(),
    },
    storeIds,
  );
  await enqueueTargets(tenantId, created.targetIds);
  logger.info("listing.grid_created", {
    tenantId,
    familyId: created.familyId,
    listings: created.listed.length,
    targets: created.targetIds.length,
  });
  return {
    familyId: created.familyId,
    published: created.listed.length,
    skipped: skippedOutcome(combinations, outOfStock, created.skipped),
    targetIds: created.targetIds,
  };
}
