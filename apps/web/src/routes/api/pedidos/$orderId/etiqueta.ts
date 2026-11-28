import { createFileRoute } from "@tanstack/react-router";
import {
  getSupplierShipment,
  recordLabelsPrinted,
  recordLabelsWaiting,
} from "@sellbridge/database/repositories";
import {
  type ConfirmedPickup,
  hasMarketplaceCause,
  LABEL_NOT_READY_CAUSE,
} from "@sellbridge/marketplaces";
import { isAppError, validationError } from "@sellbridge/shared/errors";
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
import { appOriginFor } from "@/lib/server/app-origin";
import { assertSameOrigin } from "@/lib/server/http";
import { requireSellerRequest } from "@/lib/server/tenant-session";
import { labelErrorPage } from "@/features/fulfillment/label-error-page";
import { labelFileName } from "@/features/fulfillment/label-file-name";
import {
  type LabelAsk,
  loadMarketplaceLabel,
  shopeePickupStep,
} from "@/features/fulfillment/marketplace.server";
import {
  PICKUP_ADDRESS_FIELD,
  PICKUP_TIME_FIELD,
  pickupConfirmationPage,
  pickupMissingPage,
} from "@/features/fulfillment/pickup-page";
import { keepLabelRecord } from "@/features/fulfillment/label-records.server";
import {
  assertSupplierLabelAvailable,
  panelLabelIds,
  panelLabelShipmentId,
} from "@/lib/server/panel-label-access";
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
  if (shipment.orderId !== orderId) {
    throw new Error("Acesso inválido");
  }

  assertSupplierLabelAvailable(shipment);
  return shipment.id;
}

/** The format the form asks for (`formato`); a form without one gets the PDF. */
function formatOf(form: URLSearchParams | null): LabelFormat {
  const asked = form?.get("formato") ?? null;
  if (asked === null) {
    return "pdf";
  }
  const format = labelFormatSchema.safeParse(asked);
  if (!format.success) {
    throw validationError("Escolha a etiqueta em PDF ou em ZPL.");
  }
  return format.data;
}

/**
 * The reseller opens an existing label with a GET and requests Shopee labels with a POST.
 * The supplier posts a
 * form: the link's token (see supplier-link-token.ts), or, from the signed-in panel, its supplier
 * and parcel ids, and the format. A token in the URL, from an old link, is refused unread.
 */
async function labelRequest(
  request: Request,
  orderId: string,
): Promise<{ tenantId: string; format: LabelFormat; form: URLSearchParams | null }> {
  if (hasTokenInUrl(request)) {
    throw validationError("Abra a etiqueta pelo botão da página do pedido.");
  }
  if (request.method !== "POST") {
    return { tenantId: (await requireSellerRequest(request)).tenantId, format: "pdf", form: null };
  }

  const form = await readLabelForm(request);
  const format = formatOf(form);
  const token = tokenOf(form);
  if (token !== null) {
    const shipmentId = await tokenLabelShipmentId(token, orderId);
    return { tenantId: await shipmentTenantId(shipmentId), format, form };
  }

  // Private forms can suppress Origin. Fetch Metadata still identifies same-origin submissions.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    assertSameOrigin(request, appOriginFor(request.url));
  }

  const panelIds = panelLabelIds(form);
  if (panelIds !== null) {
    const shipmentId = await panelLabelShipmentId(request, orderId, panelIds);
    return { tenantId: await shipmentTenantId(shipmentId), format, form };
  }

  if (form?.get("solicitar") === "revenda") {
    return { tenantId: (await requireSellerRequest(request)).tenantId, format, form };
  }

  throw validationError("Abra a etiqueta pelo botão da página do pedido.");
}
/**
 * The label of an order allowed to see it, recorded on its parcel: emitted, or not released by
 * the marketplace yet. The supplier's list reads these records as the label's state.
 */
async function recordedLabel(tenantId: string, orderId: string, ask: LabelAsk) {
  const label = await recordingLabelWait(orderId, async () =>
    loadMarketplaceLabel(tenantId, orderId, ask),
  );
  await keepLabelRecord(
    async () =>
      await recordLabelsPrinted(database, [{ orderId, marketplaceShipmentId: label.shipmentId }]),
  );
  return label;
}

/**
 * Runs a step that reads the marketplace for the label: a label it has not released yet is
 * recorded as waiting on the parcel, whichever step (pickup or label) learned it first.
 */
async function recordingLabelWait<Result>(
  orderId: string,
  step: () => Promise<Result>,
): Promise<Result> {
  try {
    return await step();
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
function labelHeaders(label: Awaited<ReturnType<typeof recordedLabel>>) {
  const fileName = labelFileName(label.file.format, label.externalOrderId);
  if (label.file.format === "zpl") {
    return {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
    };
  }
  return {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${fileName}"`,
  };
}

const confirmedPickupSchema = z.object({
  addressId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pickupTimeId: z.string().trim().max(200),
});

/** The pickup the confirmation page sent back; null on a first request. */
function confirmedPickupOf(form: URLSearchParams | null): ConfirmedPickup | null {
  const addressId = form?.get(PICKUP_ADDRESS_FIELD) ?? null;
  if (addressId === null) {
    return null;
  }
  const parsed = confirmedPickupSchema.safeParse({
    addressId,
    pickupTimeId: form?.get(PICKUP_TIME_FIELD) ?? "",
  });
  if (!parsed.success) {
    throw validationError("Peça a etiqueta de novo pelo botão da página do pedido.");
  }
  const { pickupTimeId } = parsed.data;
  return {
    addressId: parsed.data.addressId,
    pickupTimeId: pickupTimeId === "" ? undefined : pickupTimeId,
  };
}

function htmlPage(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
    },
  });
}

/**
 * A Shopee label whose carrier picks the parcel up waits for the requester to confirm where:
 * this returns the confirmation (or what is missing) as a page, or the pickup to schedule.
 */
async function pickupOrPage(
  request: Request,
  labelOrder: { tenantId: string; orderId: string; form: URLSearchParams | null },
): Promise<{ pickup: ConfirmedPickup | undefined } | Response> {
  if (request.method !== "POST") {
    return { pickup: undefined };
  }
  const { tenantId, orderId, form } = labelOrder;
  const confirmed = confirmedPickupOf(form);
  const step = await recordingLabelWait(orderId, async () =>
    shopeePickupStep(tenantId, orderId, confirmed),
  );
  if (step.kind === "proceed") {
    return { pickup: step.pickup };
  }
  if (step.kind === "missing") {
    return htmlPage(pickupMissingPage(step.missing), 409);
  }
  const url = new URL(request.url);
  return htmlPage(
    pickupConfirmationPage({
      ...step.confirmation,
      form: form ?? new URLSearchParams(),
      action: url.pathname + url.search,
    }),
    200,
  );
}

async function handleLabel(request: Request, orderId: string) {
  try {
    const validOrderId = z.uuid().parse(orderId);
    const { tenantId, format, form } = await labelRequest(request, validOrderId);
    const step = await pickupOrPage(request, { tenantId, orderId: validOrderId, form });
    if (step instanceof Response) {
      return step;
    }
    const label = await recordedLabel(tenantId, validOrderId, {
      format,
      allowGeneration: request.method === "POST",
      pickup: step.pickup,
    });
    return new Response(label.file.bytes, {
      headers: {
        ...labelHeaders(label),
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
