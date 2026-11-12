import type { ShipmentInvoiceFiles } from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { INVOICE_FILE_KINDS } from "@sellbridge/shared/supplier-invoice";
import { z } from "zod";
import {
  assertSupplierPanelAccess,
  type SupplierPanelViewer,
} from "@/lib/server/supplier-panel-access";

/** `?envio=<parcel>&arquivo=xml|danfe`, plus `fornecedor=<id>` when the supplier's panel asks. */
export const invoiceFileQuerySchema = z.object({
  envio: z.uuid(),
  arquivo: z.enum(INVOICE_FILE_KINDS),
  fornecedor: z.uuid().optional(),
});

/** Who asks for the file: the reseller's workspace, or a supplier panel for one supplier. */
export type InvoiceFileRequester =
  | { readonly kind: "reseller"; readonly tenantId: string }
  | {
      readonly kind: "supplier";
      readonly viewer: SupplierPanelViewer;
      readonly supplierId: string;
    };

const NOT_FOUND = "A nota fiscal deste pacote não foi encontrada.";

/**
 * Only the reseller of the order and the supplier who issued the note get its files. Anyone else
 * hears "not found", so a guessed id tells nothing.
 *
 * @throws {AppError} NOT_FOUND when the note is not of this order or not the requester's;
 * FORBIDDEN when a panel asks for another supplier.
 */
export function assertInvoiceFileAccess(
  files: ShipmentInvoiceFiles,
  orderId: string,
  requester: InvoiceFileRequester,
): void {
  if (files.orderId !== orderId) {
    throw notFoundError(NOT_FOUND);
  }
  if (requester.kind === "reseller") {
    if (files.tenantId !== requester.tenantId) {
      throw notFoundError(NOT_FOUND);
    }
    return;
  }
  assertSupplierPanelAccess(requester.viewer, requester.supplierId);
  if (files.supplierId !== requester.supplierId) {
    throw notFoundError(NOT_FOUND);
  }
}
