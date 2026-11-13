import type { InvoiceFileKind } from "@sellbridge/shared/supplier-invoice";

/**
 * Where a note's file downloads. The supplier's panel names its supplier, so the route checks the
 * panel's access rule instead of the reseller's.
 */
export function invoiceFileLink(input: {
  orderId: string;
  shipmentId: string;
  kind: InvoiceFileKind;
  supplierId?: string;
}): string {
  const query = new URLSearchParams({ envio: input.shipmentId, arquivo: input.kind });
  if (input.supplierId !== undefined) {
    query.set("fornecedor", input.supplierId);
  }
  return `/api/pedidos/${input.orderId}/nota-fiscal?${query.toString()}`;
}
