import type { ShipmentView } from "@/components/fulfillment/shipment-panel";
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}
export function shipmentDocument(
  shipment: ShipmentView,
  externalOrderId: string,
  kind: "label" | "order",
) {
  if (shipment.catalogKind === "seller")
    return ownShipmentDocument(shipment, externalOrderId, kind);
  const address = shipment.address;
  if (!address) throw new Error("Este envio já foi encerrado");
  const safe = escapeHtml;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${safe(externalOrderId)}</title><style>body{font:16px/1.5 "Manrope",system-ui,sans-serif;margin:24px;color:#000;background:#fff}#print{font:inherit;font-size:14px;margin-bottom:16px;padding:8px 16px;border-radius:9999px;border:1px solid #c8c8c8;background:#fff;color:#000;cursor:pointer}#print:focus-visible{outline:2px solid #2f7a55;outline-offset:2px}article{border:2px solid #000;padding:20px;max-width:600px}h1{font-size:22px}p{line-height:1.5}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #ccc}@media print{button{display:none}body{margin:0}article{break-inside:avoid}}</style></head><body><button id="print">Imprimir / salvar PDF</button><article><h1>${kind === "label" ? "Etiqueta de identificação" : "Ordem de fornecimento"}</h1><p>Pedido: <strong>${safe(externalOrderId)}</strong><br>Fornecedor: ${safe(shipment.supplierName)}<br>Volume: ${safe(shipment.id)}</p><h2>Destinatário</h2><p><strong>${safe(address.recipient)}</strong><br>${safe(address.street)}, ${safe(address.number)} ${safe(address.complement)}<br>${safe(address.neighborhood)}<br>${safe(address.city)} / ${safe(address.state)}<br>CEP ${safe(address.postalCode)}</p>${kind === "order" ? `<table><thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th></tr></thead><tbody>${shipment.items.map((item) => `<tr><td>${safe(item.sku)}</td><td>${safe(item.title)}</td><td>${item.quantity}</td></tr>`).join("")}</tbody></table><p>${safe(shipment.notes)}</p>` : ""}<p>${safe(shipment.carrier ?? "")} ${safe(shipment.trackingCode ?? "")}</p><small>Esta identificação não substitui a etiqueta de postagem da transportadora.</small></article><script>document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`;
}
export function printShipment(
  shipment: ShipmentView,
  externalOrderId: string,
  kind: "label" | "order",
) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Permita abrir uma nova janela para imprimir");
  popup.opener = null;
  popup.document.open();
  popup.document.write(shipmentDocument(shipment, externalOrderId, kind));
  popup.document.close();
}

/** Own stock travels with a packing list, without supplier-order wording. */
function ownShipmentDocument(shipment: ShipmentView, orderId: string, kind: "label" | "order") {
  const address = shipment.address;
  if (!address) throw new Error("Este envio está encerrado");
  const safe = escapeHtml;
  const items =
    kind === "order"
      ? shipment.items
          .map(
            (item) =>
              `<tr><td>${safe(item.sku)}</td><td>${safe(item.title)}</td><td>${item.quantity}</td></tr>`,
          )
          .join("")
      : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${safe(orderId)}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:24px;color:#000;background:#fff}article{border:2px solid #000;padding:20px;max-width:600px}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #ccc}@media print{button{display:none}body{margin:0}article{break-inside:avoid}}</style></head><body><button id="print">Imprimir / salvar PDF</button><article><h1>${kind === "order" ? "Lista de separação" : "Identificação do pacote"}</h1><p>Pedido: ${safe(orderId)}<br>Seu envio: ${safe(shipment.id)}</p><h2>Destinatário</h2><p>${safe(address.recipient)}<br>${safe(address.street)}, ${safe(address.number)} ${safe(address.complement)}<br>${safe(address.neighborhood)}<br>${safe(address.city)} / ${safe(address.state)}<br>${safe(address.postalCode)}</p>${kind === "order" ? `<table><thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th></tr></thead><tbody>${items}</tbody></table><p>${safe(shipment.notes)}</p>` : ""}<p>${safe(shipment.carrier ?? "")} ${safe(shipment.trackingCode ?? "")}</p><small>Esta identificação não substitui a etiqueta de postagem da transportadora.</small></article><script>document.getElementById('print').addEventListener('click',()=>window.print())</script></body></html>`;
}
