import { createFileRoute } from "@tanstack/react-router";
import { getSupplierShipment } from "@sellbridge/database/repositories";
import { conflictError, isAppError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { supplierTokenSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { orderShipments } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { database } from "@/lib/server/database";
import { requireTenantSession } from "@/lib/server/tenant-session";
import { loadMarketplaceLabel } from "@/features/fulfillment/marketplace.server";
import { hasTokenInUrl, readSupplierToken } from "@/lib/server/supplier-link-token";

/**
 * The reseller opens the label with a GET from their session. The supplier posts the link's
 * token in the form body (see supplier-link-token.ts): a token in the URL, from an old link,
 * is refused without being read.
 */
async function labelTenant(request: Request, orderId: string) {
  if (hasTokenInUrl(request)) {
    throw validationError("Abra a etiqueta pelo botão da página do pedido.");
  }
  if (request.method !== "POST") {
    return (await requireTenantSession(request.headers)).tenantId;
  }
  const token = await readSupplierToken(request);
  if (token === null) {
    throw validationError("Abra a etiqueta pelo botão da página do pedido.");
  }
  const validToken = supplierTokenSchema.parse(token);
  const shipment = await getSupplierShipment(database, validToken);
  if (shipment.orderId !== orderId) throw new Error("Acesso inválido");
  // The label carries the buyer's address: only while this parcel is still on its way out.
  if (shipment.address === null) throw conflictError("Este envio já foi encerrado");
  const [row] = await database
    .select({ tenantId: orderShipments.tenantId })
    .from(orderShipments)
    .where(eq(orderShipments.id, shipment.id));
  if (!row) throw new Error("Acesso inválido");
  return row.tenantId;
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
    return new Response(
      isAppError(error) ? error.userMessage : "Não foi possível gerar a etiqueta",
      {
        status,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
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
