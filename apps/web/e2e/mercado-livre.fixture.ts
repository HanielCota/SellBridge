import type { FetchLike } from "@sellbridge/marketplaces";
import { zipArchive } from "@sellbridge/marketplaces/testing";

/**
 * A stand-in for the Mercado Livre API the web server calls directly (the order's shipment and its
 * label), so the browser tests never reach the real service. It answers only for this seller and
 * for order numbers starting with `E2E_MERCADO_LIVRE_ORDER_PREFIX`; anything else is a 404, as
 * Mercado Livre answers an unknown order. Shapes follow the official "Mercado Envios 2" and
 * "Gerenciamento de envios" pages (read on 2026-11-12).
 */
export const E2E_MERCADO_LIVRE_SELLER_ID = "770001234";
export const E2E_MERCADO_LIVRE_ORDER_PREFIX = "7700";

/** What every ZPL label of the stand-in prints, so a test can find its download. */
export function standInZpl(shipmentId: string): string {
  return `^XA^FO40,40^A0N,40,40^FDEnvio ${shipmentId}^FS^XZ`;
}

const notFound = () => Response.json({ message: "not_found", status: 404 }, { status: 404 });

function knownOrder(id: string | undefined): id is string {
  return id !== undefined && id.startsWith(E2E_MERCADO_LIVRE_ORDER_PREFIX);
}

/** The shipment ids of a `shipment_labels` call, all of them known to the stand-in. */
function labelShipmentIds(url: URL): string[] | null {
  const ids = (url.searchParams.get("shipment_ids") ?? "").split(",");
  return ids.every(knownOrder) ? ids : null;
}

function label(url: URL): Response {
  const ids = labelShipmentIds(url);
  if (ids === null) {
    return notFound();
  }
  if (url.searchParams.get("response_type") === "pdf") {
    return new Response(`%PDF-1.4\n% Etiquetas ${ids.join(",")}\n%%EOF`);
  }
  const files = ids.map((id) => ({ name: `${id}.txt`, content: standInZpl(id), deflate: true }));
  return new Response(zipArchive(files), { headers: { "content-type": "application/zip" } });
}

/** A sale shipment ready to print: Mercado Envios 2, dropped off at an agency. */
function shipment(id: string): Response {
  return Response.json({
    id: Number(id),
    status: "ready_to_ship",
    substatus: "ready_to_print",
    mode: "me2",
    logistic_type: "drop_off",
    tracking_number: null,
    tracking_method: null,
  });
}

export const mercadoLivreStandIn: FetchLike = async (input) => {
  const url = new URL(input);
  if (url.host !== "api.mercadolibre.com") {
    return notFound();
  }
  if (url.pathname === "/shipment_labels") {
    return label(url);
  }
  const [, resource, id, detail] = url.pathname.split("/");
  if (!knownOrder(id)) {
    return notFound();
  }
  if (resource === "orders" && detail === undefined) {
    return Response.json({ seller: { id: Number(E2E_MERCADO_LIVRE_SELLER_ID) } });
  }
  if (resource === "orders" && detail === "shipments") {
    return Response.json([{ id: Number(id), type: "forward" }]);
  }
  if (resource === "shipments" && detail === undefined) {
    return shipment(id);
  }
  return notFound();
};
