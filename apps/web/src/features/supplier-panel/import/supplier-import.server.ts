import { loadProductCategories } from "@/lib/server/reference-data";
import { getAdminSupplier } from "@sellbridge/database/repositories";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { parseProductCsv, type ProductCsvError } from "@sellbridge/shared/product-csv";
import {
  normalizeImportFile,
  type NormalizedImport,
} from "@sellbridge/shared/supplier-panel-import";
import {
  buildFailedRowsCsv,
  buildImportGuideCsv,
  buildImportTemplateCsv,
  buildValidRowsCsv,
} from "@sellbridge/shared/supplier-panel-import-files";
import {
  firstInsecureImageUrl,
  insecureImageErrors,
  shortValue,
} from "@sellbridge/shared/supplier-panel-image-urls";
import { groupIssuesByRow } from "@sellbridge/shared/supplier-panel-import-issues";
import type {
  SupplierImportConfirmInput,
  SupplierImportPreview,
  SupplierImportPreviewInput,
  SupplierImportResult,
} from "@sellbridge/shared/supplier-panel-import-schemas";
import { IMPORT_DELIMITER_LABELS } from "@sellbridge/shared/supplier-panel-import-table";
import { IMPORT_ENCODING_LABELS } from "@sellbridge/shared/supplier-panel-import-decode";
import {
  confirmAdminProductCsv,
  previewAdminProductCsv,
} from "@/features/admin-suppliers/suppliers.server";
import { database } from "@/lib/server/database";

/**
 * The supplier's own catalog import. The rules, the preview token and the write are the admin
 * import's (product-csv and `suppliers.server`); this layer reads any spreadsheet, explains each
 * error and lets the supplier import only the valid rows. `supplierId` always comes from the
 * caller, which decides who may act for that supplier.
 */

/** product-csv numbers lines in the converted file; the supplier sees their own file's lines. */
function originalErrors(normalized: NormalizedImport, errors: readonly ProductCsvError[]) {
  const structural = [...normalized.records.values()]
    .filter((record) => record.structuralError !== null)
    .map((record) => ({ line: record.line, reason: record.structuralError ?? "" }));
  const mapped = errors.map((error) => ({
    ...error,
    line: normalized.originalLines.get(error.line) ?? error.line,
  }));
  return [...mapped, ...structural];
}

/**
 * product-csv and import-plan errors, plus the supplier-only rule that photos are https; none to
 * check when every row had broken quotes.
 */
async function productRuleErrors(supplierId: string, normalized: NormalizedImport) {
  if (normalized.originalLines.size === 0) {
    return [];
  }
  const preview = await previewAdminProductCsv({ supplierId, content: normalized.canonicalCsv });
  const imageErrors = insecureImageErrors(parseProductCsv(normalized.canonicalCsv).rows);
  return [...preview.errors, ...imageErrors];
}

/** Previews the valid rows alone, so confirming imports them and nothing else. */
async function prepareConfirmation(supplierId: string, content: string) {
  const preview = await previewAdminProductCsv({ supplierId, content });
  if (preview.errors.length > 0) {
    // Rows that passed alone must pass together; if not, the catalog changed mid-preview.
    logger.warn("supplier_panel.import_valid_rows_rejected", {
      supplierId,
      errors: preview.errors.length,
    });
    throw conflictError("O catálogo mudou durante a prévia; envie o arquivo de novo");
  }
  return { preview, confirmation: { content, previewToken: preview.previewToken } };
}

function fileInfo(normalized: NormalizedImport): SupplierImportPreview["file"] {
  return {
    format: normalized.format,
    encodingLabel:
      normalized.encoding === null ? null : IMPORT_ENCODING_LABELS[normalized.encoding],
    delimiterLabel:
      normalized.delimiter === null ? null : IMPORT_DELIMITER_LABELS[normalized.delimiter],
  };
}

export async function previewSupplierImport(
  input: SupplierImportPreviewInput,
): Promise<SupplierImportPreview> {
  const normalized = normalizeImportFile(Buffer.from(input.fileBase64, "base64"));
  const ruleErrors = await productRuleErrors(input.supplierId, normalized);
  const issues = groupIssuesByRow(
    originalErrors(normalized, ruleErrors),
    normalized.records,
    normalized,
  );
  const failedLines = new Set(issues.map((row) => row.line));
  const valid = buildValidRowsCsv(normalized, normalized.records, failedLines);
  const prepared =
    valid.rowCount === 0 ? null : await prepareConfirmation(input.supplierId, valid.content);
  logger.info("supplier_panel.import_previewed", {
    supplierId: input.supplierId,
    format: normalized.format,
    encoding: normalized.encoding,
    totalRows: normalized.records.size,
    failedRows: issues.length,
  });
  return {
    file: fileInfo(normalized),
    totalRows: normalized.records.size,
    validRows: valid.rowCount,
    failedRows: issues.length,
    created: prepared?.preview.created ?? 0,
    updated: prepared?.preview.updated ?? 0,
    issues,
    failedRowsCsv:
      issues.length === 0 ? "" : buildFailedRowsCsv(normalized, normalized.records, issues),
    confirmation: prepared?.confirmation ?? null,
  };
}

/** Imports the valid rows the preview prepared; a changed catalog asks for a new preview. */
export async function confirmSupplierImport(
  input: SupplierImportConfirmInput,
): Promise<SupplierImportResult> {
  // The preview left http photos out; a confirmation must not bring them back.
  const insecureUrl = firstInsecureImageUrl(parseProductCsv(input.content).rows);
  if (insecureUrl !== null) {
    throw validationError(
      `Link de imagem inválido (recebido: "${shortValue(insecureUrl)}"); esperado: um link que comece com https://`,
    );
  }
  const imported = await confirmAdminProductCsv(input, { reviewAt: new Date() });
  logger.info("supplier_panel.import_confirmed", {
    supplierId: input.supplierId,
    created: imported.created,
    updated: imported.updated,
    pausedTargets: imported.pausedTargets,
  });
  return imported;
}

/** The template (header and one example) and the guide with every column and category. */
export async function loadSupplierImportFiles(supplierId: string) {
  const [, categories] = await Promise.all([
    getAdminSupplier(database, supplierId),
    loadProductCategories(),
  ]);
  const options = categories.map((category) => ({ name: category.name, slug: category.slug }));
  return {
    templateCsv: buildImportTemplateCsv(options[0]?.slug ?? null),
    guideCsv: buildImportGuideCsv(options),
    categories: options,
  };
}
