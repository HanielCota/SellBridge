import {
  supplierCatalogExportBatches,
  type SupplierCatalogExportFilter,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { catalogListSearchSchema } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import {
  productExportLines,
  productExportStart,
} from "@sellbridge/shared/supplier-panel-import-files";
import { csvResponse } from "@/features/report-kit/csv-file";
import { findExportSupplier } from "@/features/supplier-panel/report/supplier-export.server";
import { database } from "@/lib/server/database";
import { productExportFileName } from "./product-export-file";

/*
 * "Baixar produtos" on the Produtos page: the supplier's products in the import's own format,
 * to edit in Excel and import back. Always the panel's supplier (the tab's profile), never an id
 * from the address; the list's filters come from the address and fall back to "all".
 */

/** Rows read per query; the file goes out batch by batch, so its size never sits in memory. */
const EXPORT_BATCH_SIZE = 500;

const exportSearchSchema = catalogListSearchSchema.pick({
  status: true,
  query: true,
  fiscal: true,
});

function exportFilter(request: Request, supplierId: string): SupplierCatalogExportFilter {
  const search = exportSearchSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { ...search, supplierId };
}

function productExportStream(filter: SupplierCatalogExportFilter): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const batches = supplierCatalogExportBatches(database, filter, EXPORT_BATCH_SIZE);
  let rows = 0;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(productExportStart()));
    },
    async pull(controller) {
      try {
        const next = await batches.next();
        if (next.done === true) {
          logger.info("supplier_panel.products_exported", { supplierId: filter.supplierId, rows });
          controller.close();
          return;
        }
        rows += next.value.length;
        controller.enqueue(encoder.encode(productExportLines(next.value)));
      } catch (error) {
        logger.error("supplier_panel.products_export_failed", {
          supplierId: filter.supplierId,
          rows,
          error,
        });
        controller.error(error);
      }
    },
    async cancel() {
      await batches.return(undefined);
    },
  });
}

/** GET handler of `/api/fornecedor/exportar/catalogo`. */
export async function handleProductSpreadsheetExport(request: Request): Promise<Response> {
  const supplier = await findExportSupplier(request);
  if (supplier instanceof Response) {
    return supplier;
  }
  const fileName = productExportFileName(supplier.name, new Date());
  return csvResponse(fileName, productExportStream(exportFilter(request, supplier.id)));
}
