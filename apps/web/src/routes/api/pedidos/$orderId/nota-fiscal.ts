import { createFileRoute } from "@tanstack/react-router";
import { findShipmentInvoiceFiles } from "@sellbridge/database/repositories";
import { configurationError, isAppError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  INVOICE_FILE_CONTENT_TYPES,
  INVOICE_FILE_FORMATS,
  invoiceFileName,
} from "@sellbridge/shared/supplier-invoice";
import { z } from "zod";
import { requestedProfileOf } from "@/lib/profile-param";
import { database } from "@/lib/server/database";
import { resolveSupplierPanelViewer } from "@/lib/server/supplier-panel-viewer";
import { requireSellerRequest, requireTenantSession } from "@/lib/server/tenant-session";
import {
  blingCredentials,
  supplierBlingClient,
} from "@/features/supplier-panel/bling/bling-access.server";
import {
  assertInvoiceFileAccess,
  invoiceFileQuerySchema,
  type InvoiceFileRequester,
} from "@/features/fulfillment/invoice-files";
import { labelErrorPage } from "@/features/fulfillment/label-error-page";

const STATUS_BY_CODE: Partial<Record<string, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EXTERNAL_PROVIDER: 502,
  CONFIGURATION: 503,
};

async function requesterOf(
  request: Request,
  supplierId: string | undefined,
): Promise<InvoiceFileRequester> {
  if (supplierId === undefined) {
    return { kind: "reseller", tenantId: (await requireSellerRequest(request)).tenantId };
  }
  const session = await requireTenantSession(
    request.headers,
    requestedProfileOf({ headers: request.headers, url: request.url }),
  );
  return { kind: "supplier", viewer: await resolveSupplierPanelViewer(session), supplierId };
}

/** The note's XML or DANFE, read from the supplier's Bling on each download (nothing is kept). */
async function handleInvoiceFile(request: Request, orderId: string): Promise<Response> {
  const validOrderId = z.uuid().parse(orderId);
  const query = invoiceFileQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const requester = await requesterOf(request, query.fornecedor);
  const files = await findShipmentInvoiceFiles(database, query.envio);
  if (files === null) {
    throw notFoundError("A nota fiscal deste pacote ainda não foi emitida.");
  }
  assertInvoiceFileAccess(files, validOrderId, requester);
  const credentials = blingCredentials();
  if (credentials === null) {
    throw configurationError("Bling não configurado: não dá para baixar a nota agora.");
  }
  const content = await supplierBlingClient(files.supplierId, credentials).getInvoiceDocument(
    files.accessKey,
    INVOICE_FILE_FORMATS[query.arquivo],
  );
  return new Response(new Uint8Array(content), {
    headers: {
      "content-type": INVOICE_FILE_CONTENT_TYPES[query.arquivo],
      "content-disposition": `attachment; filename="${invoiceFileName(files, query.arquivo)}"`,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function refusal(error: unknown): Response {
  const code = isAppError(error) ? error.code : "UNEXPECTED";
  const status = STATUS_BY_CODE[code] ?? 400;
  logger.warn("web.invoice_file_refused", { status, code });
  const message =
    isAppError(error) && code !== "EXTERNAL_PROVIDER"
      ? error.userMessage
      : "Não deu para baixar a nota agora. Tente de novo em alguns minutos.";
  return new Response(labelErrorPage(message, "Nota fiscal"), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
    },
  });
}

export const Route = createFileRoute("/api/pedidos/$orderId/nota-fiscal")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return await handleInvoiceFile(request, params.orderId);
        } catch (error) {
          return refusal(error);
        }
      },
    },
  },
});
