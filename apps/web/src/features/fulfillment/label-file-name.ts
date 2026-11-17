import type { LabelFormat } from "@sellbridge/shared/schemas";

/**
 * The file name of an order's marketplace label, by the order number the supplier sees on the
 * screen and on the parcel: "etiqueta-pedido-770042411183.pdf", or for the Zebra printer
 * "etiqueta-zebra-pedido-770042411183.txt", named like Mercado Livre's own.
 */
export function labelFileName(format: LabelFormat, externalOrderId: string): string {
  const orderNumber = externalOrderId.replace(/[^0-9A-Za-z-]/g, "");
  if (format === "zpl") {
    return `etiqueta-zebra-pedido-${orderNumber}.txt`;
  }
  return `etiqueta-pedido-${orderNumber}.pdf`;
}
