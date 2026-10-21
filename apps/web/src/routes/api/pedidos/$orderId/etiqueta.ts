import { createFileRoute } from "@tanstack/react-router";
import { getSupplierShipment } from "@sellbridge/database/repositories";
import { conflictError, isAppError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { supplierTokenSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { orderShipments } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { database } from "@/lib/server/database";
import { requireSellerRequest } from "@/lib/server/tenant-session";
import { labelErrorPage } from "@/features/fulfillment/label-error-page";
import { loadMarketplaceLabel } from "@/features/fulfillment/marketplace.server";
import { panelLabelIds, panelLabelShipmentId } from "@/lib/server/panel-label-access";
import { hasTokenInUrl, readLabelForm, tokenOf } from "@/lib/server/supplier-link-token";

async function shipmentTenantId(shipmentId: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: orderShipments.tenantId })
    .from(orderShipments)
    .where(eq(orderShipments.id, shipmentId));
  if (!row) throw new Error("Acesso inválido");
  return row.tenantId;
}

async function tokenLabelShipmentId(token: string, orderId: string): Promise<string> {
  const shipment = await getSupplierShipment(database, supplierTokenSchema.parse(token));
  if (shipment.orderId !== orderId) throw new Error("Acesso inválido");
  // The label carries the buyer's address: only while this parcel is still on its way out.
  if (shipment.address === null) throw conflictError("Este envio já foi encerrado");
  return shipment.id;
}

/**
 * The reseller opens the label with a GET from their session. The supplier posts a form: the
 * link's token (see supplier-link-token.ts), or, from the signed-in panel, its supplier and
 * parcel ids. A token in the URL, from an old link, is refused without being read.
 */
async function labelTenant(request: Request, orderId: string) {
  if (hasTokenInUrl(request)) {
    throw validationError("Abra a etiqueta pelo botão da página do pedido.");
  }
  if (request.method !== "POST") {
    return (await requireSellerRequest(request)).tenantId;
  }
  const form = await readLabelForm(request);
  const token = tokenOf(form);
  if (token !== null) {
    return shipmentTenantId(await tokenLabelShipmentId(token, orderId));
  }
  const panelIds = panelLabelIds(form);
  if (panelIds !== null) {
    return shipmentTenantId(await panelLabelShipmentId(request, orderId, panelIds));
  }
  throw validationError("Abra a etiqueta pelo botão da página do pedido.");
}
async function handleLabel(request: Request, orderId: string) {
  try {
    const validOrderId = z.uuid().parse(orderId);
    const tenantId = await labelTenant(request, validOrderId);
    const pdf = await loadMarketplaceLabel(tenantId, validOrderId);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="etiqueta-${validOrderId}.pdf"`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    const statuses: Partial<Record<string, number>> = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
    };
    const status = isAppError(error) ? (statuses[error.code] ?? 400) : 400;
    // The reason only: never the token or the request URL.
    logger.warn("web.label_refused", {
      status,
      code: isAppError(error) ? error.code : "UNEXPECTED",
    });
    // Opened in a new tab: a themed page instead of the plain-text view of the browser.
    return new Response(
      labelErrorPage(isAppError(error) ? error.userMessage : "Não foi possível gerar a etiqueta"),
      {
        status,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
          "referrer-policy": "no-referrer",
        },
      },
    );
  }
}
export const Route = createFileRoute("/api/pedidos/$orderId/etiqueta")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleLabel(request, params.orderId),
      POST: ({ request, params }) => handleLabel(request, params.orderId),
    },
  },
});
