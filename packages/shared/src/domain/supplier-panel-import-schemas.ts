import { z } from "zod";
import { adminConfirmProductCsvSchema, MAX_PRODUCT_CSV_BYTES } from "../schemas/admin-suppliers.ts";
import { freeText } from "../schemas/common.ts";
import type { ImportRowIssues } from "./supplier-panel-import-issues.ts";

/**
 * Inputs of the supplier import server functions and the preview they answer with. Browser
 * safe: the screen imports these types and limits; the file itself is read on the server.
 */

/** A 2 MiB file in base64, four characters for every three bytes. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_PRODUCT_CSV_BYTES / 3) * 4;
export const SUPPLIER_IMPORT_ACCEPT = ".csv,.txt,.tsv,.xlsx";

const supplierIdSchema = z.uuid("Fornecedor inválido");

export const supplierImportSupplierSchema = z.object({ supplierId: supplierIdSchema });

export const supplierImportPreviewSchema = z.object({
  supplierId: supplierIdSchema,
  fileName: freeText().trim().min(1).max(255),
  fileBase64: z
    .string()
    .min(1, "Escolha um arquivo")
    .max(MAX_BASE64_LENGTH, "O arquivo deve ter no máximo 2 MB")
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, "Arquivo em formato inesperado"),
});
export type SupplierImportPreviewInput = z.infer<typeof supplierImportPreviewSchema>;

/** The valid rows the preview prepared, and its token: the catalog must not change in between. */
export const supplierImportConfirmSchema = adminConfirmProductCsvSchema.extend({
  supplierId: supplierIdSchema,
});
export type SupplierImportConfirmInput = z.infer<typeof supplierImportConfirmSchema>;

export interface SupplierImportFileInfo {
  readonly format: "csv" | "xlsx";
  /** "UTF-8", "Windows (padrão do Excel)"…; null for .xlsx. */
  readonly encodingLabel: string | null;
  /** "ponto e vírgula", "vírgula" or "tabulação"; null for .xlsx. */
  readonly delimiterLabel: string | null;
}

export interface SupplierImportPreview {
  readonly file: SupplierImportFileInfo;
  readonly totalRows: number;
  readonly validRows: number;
  readonly failedRows: number;
  /** Of the valid rows: new SKUs and SKUs the supplier already has. */
  readonly created: number;
  readonly updated: number;
  readonly issues: readonly ImportRowIssues[];
  /** Only the failed rows plus an "erro" column; empty when nothing failed. */
  readonly failedRowsCsv: string;
  /** What confirming imports (only the valid rows), or null when there is none. */
  readonly confirmation: { readonly content: string; readonly previewToken: string } | null;
}

export interface SupplierImportResult {
  readonly created: number;
  readonly updated: number;
  readonly pausedTargets: number;
  readonly synchronizationQueued: boolean;
}
