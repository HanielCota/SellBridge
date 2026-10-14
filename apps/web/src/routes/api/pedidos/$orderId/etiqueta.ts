import { createFileRoute } from "@tanstack/react-router";
import { getSupplierShipment } from "@sellbridge/database/repositories";
import { conflictError, isAppError } from "@sellbridge/shared/errors";
import { supplierTokenSchema } from "@sellbridge/shared/schemas";
import { z } from "zod";
import { orderShipments } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { database } from "@/lib/server/database";
import { requireTenantSession } from "@/lib/server/tenant-session";
import { loadMarketplaceLabel } from "@/features/fulfillment/marketplace.server";

async function labelTenant(request: Request, orderId: string) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return (await requireTenantSession(request.headers)).tenantId;
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
  server: { handlers: { GET: ({ request, params }) => handleLabel(request, params.orderId) } },
});
