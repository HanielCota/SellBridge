import {
  answerReturnAsSupplier,
  findReturnPhoto,
  requireReturnSide,
  reserveShortItems,
  stateReturnReason,
  type NewReturnPhoto,
  type ReturnSide,
} from "@sellbridge/database/repositories";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { parseBrlToCents } from "@sellbridge/shared/money";
import { statedReasonSchema, supplierAnswerSchema } from "@sellbridge/shared/return-policy";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { assertSameOrigin, handleApi, jsonResponse } from "@/lib/server/http";
import { recordImpersonatedCall } from "@/lib/server/impersonation";
import { requireTenantRequest } from "@/lib/server/tenant-session";
import { requestStockSync } from "@/lib/server/stock-sync";
import { fileStorage } from "@/lib/server/storage";
import {
  saveWithAttachments,
  storeAttachments,
  textField,
  validateAttachments,
} from "@/features/support/attachments.server";
import {
  dispositionOf,
  firstIssue,
  parseId,
  readUploadForm,
} from "@/features/support/support.server";

/**
 * Units back on a supplier's shelf go first to paid orders that came up short, then to the
 * marketplaces. The return is already saved: a failure here is logged and the next count or
 * scheduled sync catches up.
 */
export async function propagateRestock(productIds: readonly string[]): Promise<void> {
  if (productIds.length === 0) {
    return;
  }
  try {
    await reserveShortItems(database, productIds);
  } catch (error) {
    logger.error("return_policy.reserve_failed", { products: productIds.length, error });
  }
  await requestStockSync("return_policy.sync_deferred");
}

/** "22,90" from the form, or null when the reseller left it blank. */
function shippingCentsField(formData: FormData): number | null {
  const typed = textField(formData, "returnShipping").trim();
  if (typed === "") {
    return null;
  }
  const cents = parseBrlToCents(typed);
  if (cents === null) {
    throw validationError(`Confira o valor do frete: "${typed}" não é um valor em reais`);
  }
  return cents;
}

/** Checks the side and stores the photos before the write that records them. */
async function storeSidePhotos(
  request: Request,
  claimIdParam: string | undefined,
  expected: ReturnSide,
) {
  assertSameOrigin(request, environment.APP_URL);
  const session = await requireTenantRequest(request);
  const claimId = parseId(claimIdParam, "Devolução");
  const side = await requireReturnSide(database, { claimId, tenantId: session.tenantId });
  if (side !== expected) {
    throw notFoundError("Devolução não encontrada");
  }
  const formData = await readUploadForm(request, session.userId);
  const files = await validateAttachments(formData);
  return { session, claimId, formData, files };
}

async function recordVisit(
  session: { impersonatedBy: string | null; userId: string },
  functionName: string,
) {
  await recordImpersonatedCall({
    impersonatedBy: session.impersonatedBy,
    customerId: session.userId,
    functionName,
    method: "POST",
  });
}

/** POST /api/devolucoes/:claimId/motivo: the reseller tells why the buyer sent it back. */
export function handleStateReason(request: Request, claimIdParam: string | undefined) {
  return handleApi("returns.state_reason", async () => {
    const { session, claimId, formData, files } = await storeSidePhotos(
      request,
      claimIdParam,
      "seller",
    );
    const stated = statedReasonSchema.safeParse({
      claimId,
      reason: textField(formData, "reason"),
      note: textField(formData, "note"),
      returnShippingCents: shippingCentsField(formData),
    });
    if (!stated.success) {
      throw validationError(firstIssue(stated.error));
    }
    const photos: NewReturnPhoto[] = await storeAttachments(fileStorage, session.tenantId, files);
    await saveWithAttachments(fileStorage, photos, () =>
      stateReturnReason(database, { stated: stated.data, tenantId: session.tenantId, photos }),
    );
    await recordVisit(session, "returns.state_reason");
    return jsonResponse(201, { ok: true });
  });
}

/** POST /api/devolucoes/:claimId/resposta: the supplier says how the product arrived. */
export function handleSupplierAnswer(request: Request, claimIdParam: string | undefined) {
  return handleApi("returns.supplier_answer", async () => {
    const { session, claimId, formData, files } = await storeSidePhotos(
      request,
      claimIdParam,
      "supplier",
    );
    const answer = supplierAnswerSchema.safeParse({
      claimId,
      verdict: textField(formData, "verdict"),
      condition: textField(formData, "condition"),
      resellable: textField(formData, "resellable") === "true",
    });
    if (!answer.success) {
      throw validationError(firstIssue(answer.error));
    }
    const photos: NewReturnPhoto[] = await storeAttachments(fileStorage, session.tenantId, files);
    const result = await saveWithAttachments(fileStorage, photos, () =>
      answerReturnAsSupplier(database, {
        answer: answer.data,
        tenantId: session.tenantId,
        photos,
      }),
    );
    await propagateRestock(result.restockedProductIds);
    await recordVisit(session, "returns.supplier_answer");
    return jsonResponse(201, { disputed: result.disputed });
  });
}

/** GET /api/devolucoes/fotos/:photoId: for either side of the return or the support team. */
export function handleDownloadReturnPhoto(request: Request, photoIdParam: string | undefined) {
  return handleApi("returns.photo_download", async () => {
    const photoId = parseId(photoIdParam, "Foto");
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonResponse(401, { error: "Faça login para ver as fotos" });
    }
    const tenantId = hasStaffPermission(session.user.role, "support.answer")
      ? null
      : (await requireTenantRequest(request)).tenantId;
    const photo = await findReturnPhoto(database, { photoId, tenantId });
    const bytes = await fileStorage.get(photo.storageKey);
    if (!bytes) {
      return jsonResponse(404, { error: "Arquivo não encontrado no armazenamento" });
    }
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": photo.mimeType,
        "content-disposition": `${dispositionOf(request, photo.mimeType)}; filename="${photo.fileName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  });
}
