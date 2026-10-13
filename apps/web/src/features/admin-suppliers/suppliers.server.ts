import { createHash } from "node:crypto";
import {
  getAdminSupplier,
  importSupplierProducts,
  listAdminCategories,
  listAdminSupplierProducts,
  listAdminSuppliers,
  previewSupplierProductImport,
  saveAdminSupplier,
  saveAdminSupplierProduct,
  setAdminSupplierActive,
  setAdminSupplierProductActive,
  type SupplierProductImportPlan,
} from "@sellbridge/database/repositories";
import { AppError, conflictError, isAppError, validationError } from "@sellbridge/shared/errors";
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

export async function loadAdminSupplier(supplierId: string) {
  const [detail, categories] = await Promise.all([
    getAdminSupplier(database, supplierId),
    listAdminCategories(database),
  ]);
  return { ...detail, categories };
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

/** A committed write remains successful if Redis fails; the scheduled worker retries from the database. */
async function requestSynchronization(): Promise<boolean> {
  return await requestStockSync("admin.catalog_sync_deferred");
}

export async function writeAdminSupplier(input: z.infer<typeof adminSaveSupplierSchema>) {
  return await catalogWrite(async () => await saveAdminSupplier(database, input));
}

export async function writeSupplierActive(input: { supplierId: string; active: boolean }) {
  return await catalogWrite(
    async () => await setAdminSupplierActive(database, input.supplierId, input.active),
  );
}

export async function writeAdminProduct(input: z.infer<typeof adminSaveProductSchema>) {
  const product = await catalogWrite(async () => await saveAdminSupplierProduct(database, input));
  return { product, synchronizationQueued: await requestSynchronization() };
}

export async function writeProductActive(input: z.infer<typeof adminSetProductActiveSchema>) {
  return await catalogWrite(async () => await setAdminSupplierProductActive(database, input));
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

export async function confirmAdminProductCsv(input: z.infer<typeof adminConfirmProductCsvSchema>) {
  const parsed = parseProductCsv(input.content);
  if (parsed.errors.length > 0) {
    throw validationError("Corrija os erros do CSV antes de importar");
  }
  const result = await catalogWrite(
    async () =>
      await importSupplierProducts(database, {
        supplierId: input.supplierId,
        rows: parsed.rows,
        validatePreview: (plan) => {
          if (previewToken(input.content, plan) !== input.previewToken) {
            throw conflictError(
              "O catálogo mudou desde a prévia. Gere uma nova prévia antes de confirmar",
            );
          }
        },
      }),
  );
  return { ...result, synchronizationQueued: await requestSynchronization() };
}
