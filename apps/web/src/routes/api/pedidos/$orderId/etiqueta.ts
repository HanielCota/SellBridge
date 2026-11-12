import { createFileRoute } from "@tanstack/react-router";
import {
  getSupplierShipment,
  recordLabelsPrinted,
  recordLabelsWaiting,
} from "@sellbridge/database/repositories";
import { hasMarketplaceCause, LABEL_NOT_READY_CAUSE } from "@sellbridge/marketplaces";
import { conflictError, isAppError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  type LabelFormat,
  labelFormatSchema,
  supplierTokenSchema,
} from "@sellbridge/shared/schemas";
import { z } from "zod";
import { orderShipments } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { database } from "@/lib/server/database";
import { requireSellerRequest } from "@/lib/server/tenant-session";
import { labelErrorPage } from "@/features/fulfillment/label-error-page";
import { loadMarketplaceLabel } from "@/features/fulfillment/marketplace.server";
import { keepLabelRecord } from "@/features/fulfillment/label-records.server";
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

/** The format the form asks for (`formato`); a form without one gets the PDF. */
function formatOf(form: URLSearchParams | null): LabelFormat {
  const asked = form?.get("formato") ?? null;
  return asked === null ? "pdf" : labelFormatSchema.parse(asked);
}

/**
 * The reseller opens the label with a GET from their session, as a PDF. The supplier posts a
 * form: the link's token (see supplier-link-token.ts), or, from the signed-in panel, its supplier
 * and parcel ids, and the format. A token in the URL, from an old link, is refused unread.
 */
async function labelRequest(
  request: Request,
  orderId: string,
): Promise<{ tenantId: string; format: LabelFormat }> {
  if (hasTokenInUrl(request)) {
    throw validationError("Abra a etiqueta pelo botão da página do pedido.");
  }
  if (request.method !== "POST") {
    return { tenantId: (await requireSellerRequest(request)).tenantId, format: "pdf" };
  }
  const form = await readLabelForm(request);
  const format = formatOf(form);
  const token = tokenOf(form);
  if (token !== null) {
    return { tenantId: await shipmentTenantId(await tokenLabelShipmentId(token, orderId)), format };
  }
  const panelIds = panelLabelIds(form);
  if (panelIds !== null) {
    const shipmentId = await panelLabelShipmentId(request, orderId, panelIds);
    return { tenantId: await shipmentTenantId(shipmentId), format };
  }
  throw validationError("Abra a etiqueta pelo botão da página do pedido.");
}
/**
 * The label of an order allowed to see it, recorded on its parcel: emitted, or not released by
 * the marketplace yet. The supplier's list reads these records as the label's state.
 */
async function recordedLabel(tenantId: string, orderId: string, format: LabelFormat) {
  try {
    const label = await loadMarketplaceLabel(tenantId, orderId, format);
    await keepLabelRecord(
      async () =>
        await recordLabelsPrinted(database, [{ orderId, marketplaceShipmentId: label.shipmentId }]),
    );
    return label;
  } catch (error) {
    if (hasMarketplaceCause(error, LABEL_NOT_READY_CAUSE)) {
      await keepLabelRecord(async () => await recordLabelsWaiting(database, [orderId]));
    }
    throw error;
  }
}
/**
 * The PDF opens in the browser, ready to print; the ZPL downloads as the text file the Zebra
 * printer's program sends, named like Mercado Livre's own (a .txt).
 */
function labelHeaders(label: Awaited<ReturnType<typeof recordedLabel>>, orderId: string) {
  if (label.file.format === "zpl") {
    const orderNumber = label.externalOrderId.replace(/[^0-9A-Za-z-]/g, "");
    return {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="etiqueta-zebra-pedido-${orderNumber}.txt"`,
    };
  }
  return {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="etiqueta-${orderId}.pdf"`,
  };
}

async function handleLabel(request: Request, orderId: string) {
  try {
    const validOrderId = z.uuid().parse(orderId);
    const { tenantId, format } = await labelRequest(request, validOrderId);
    const label = await recordedLabel(tenantId, validOrderId, format);
    return new Response(label.file.bytes, {
      headers: {
        ...labelHeaders(label, validOrderId),
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
