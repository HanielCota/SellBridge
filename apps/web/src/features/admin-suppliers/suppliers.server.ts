import { createHash } from "node:crypto";
import {
  getAdminSupplier,
  importSupplierProducts,
  listAdminCategories,
  listAdminSupplierProducts,
  listAdminSuppliers,
  listSupplierSellers,
  previewSupplierProductImport,
  reserveShortItems,
  saveAdminSupplier,
  saveAdminSupplierProduct,
  setAdminSupplierActive,
  setAdminSupplierProductActive,
  type SupplierProductImportPlan,
} from "@sellbridge/database/repositories";
import { AppError, conflictError, isAppError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import type { z } from "zod";
import type {
  AdminSupplierSearch,
  adminConfirmProductCsvSchema,
  adminProductCsvSchema,
  adminSaveProductSchema,
  adminSaveSupplierSchema,
  adminSetProductActiveSchema,
} from "@sellbridge/shared/schemas";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";

export async function loadAdminSuppliers(search: AdminSupplierSearch) {
  return await listAdminSuppliers(database, search.query, search);
}

/** The supplier, the categories for its products and the shops that sell it. */
export async function loadAdminSupplier(supplierId: string) {
  const [detail, categories, sellers] = await Promise.all([
    getAdminSupplier(database, supplierId),
    listAdminCategories(database),
    listSupplierSellers(database, supplierId),
  ]);
  return { ...detail, categories, sellers };
}

export async function loadAdminProducts(input: AdminSupplierSearch & { supplierId: string }) {
  return await listAdminSupplierProducts(database, input.supplierId, input.query, input);
}

async function catalogWrite<TResult>(write: () => Promise<TResult>): Promise<TResult> {
  try {
    return await write();
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw new AppError("CONFLICT", "Não foi possível salvar o catálogo. Tente novamente.", {
      cause: error,
    });
  }
}

/**
 * Paid items that came up short get the new units first, before the sync offers them to new
 * buyers. Runs after the catalog write commits: a failure here leaves the shortage as it was
 * (it is retried on the next count or order update), never the count unsaved.
 */
async function reserveRestockedShortages(productIds: readonly string[]): Promise<void> {
  try {
    await reserveShortItems(database, productIds);
  } catch (error) {
    logger.error("admin.short_reservation_failed", { productIds: productIds.length, error });
  }
}

/** A committed write remains successful if Redis fails; the scheduled worker retries from the database. */
async function requestSynchronization(): Promise<boolean> {
  return await requestStockSync("admin.catalog_sync_deferred");
}

/** Like every catalog write, a saved supplier asks the worker to sync right away. */
export async function writeAdminSupplier(input: z.infer<typeof adminSaveSupplierSchema>) {
  const supplier = await catalogWrite(async () => await saveAdminSupplier(database, input));
  return { ...supplier, synchronizationQueued: await requestSynchronization() };
}

/** Deactivating pauses the supplier's live listings; the sync sends their zero stock right away. */
export async function writeSupplierActive(input: { supplierId: string; active: boolean }) {
  const { supplier, pausedTargets } = await catalogWrite(
    async () => await setAdminSupplierActive(database, input.supplierId, input.active),
  );
  return { ...supplier, pausedTargets, synchronizationQueued: await requestSynchronization() };
}

export async function writeAdminProduct(input: z.infer<typeof adminSaveProductSchema>) {
  const product = await catalogWrite(async () => await saveAdminSupplierProduct(database, input));
  await reserveRestockedShortages([product.id]);
  return { product, synchronizationQueued: await requestSynchronization() };
}

export async function writeProductActive(input: z.infer<typeof adminSetProductActiveSchema>) {
  const { product, pausedTargets } = await catalogWrite(
    async () => await setAdminSupplierProductActive(database, input),
  );
  return { ...product, pausedTargets, synchronizationQueued: await requestSynchronization() };
}

function previewToken(content: string, plan: SupplierProductImportPlan): string {
  return createHash("sha256").update(content).update(plan.revision).digest("hex");
}

export async function previewAdminProductCsv(input: z.infer<typeof adminProductCsvSchema>) {
  const parsed = parseProductCsv(input.content);
  const plan = await previewSupplierProductImport(database, input.supplierId, parsed.rows);
  return {
    created: plan.created,
    updated: plan.updated,
    errors: [...parsed.errors, ...plan.errors].toSorted(
      (first, second) => first.line - second.line,
    ),
    previewToken: previewToken(input.content, plan),
  };
}

/** `reviewAt`: the supplier panel's import, whose rows go through review (PR #44). */
export async function confirmAdminProductCsv(
  input: z.infer<typeof adminConfirmProductCsvSchema>,
  options: { reviewAt?: Date } = {},
) {
  const parsed = parseProductCsv(input.content);
  if (parsed.errors.length > 0) {
    throw validationError("Corrija os erros do CSV antes de importar");
  }
  const result = await catalogWrite(
    async () =>
      await importSupplierProducts(database, {
        supplierId: input.supplierId,
        rows: parsed.rows,
        ...options,
        validatePreview: (plan) => {
          if (previewToken(input.content, plan) !== input.previewToken) {
            throw conflictError(
              "O catálogo mudou desde a prévia. Gere uma nova prévia antes de confirmar",
            );
          }
        },
      }),
  );
  const { productIds, ...counts } = result;
  await reserveRestockedShortages(productIds);
  return { ...counts, synchronizationQueued: await requestSynchronization() };
}
