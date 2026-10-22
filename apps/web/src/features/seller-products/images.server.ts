import { randomUUID } from "node:crypto";
import { ensureSellerCatalog } from "@sellbridge/database/repositories";
import { adminAuditEvents } from "@sellbridge/database/schema";
import { forbiddenError, validationError } from "@sellbridge/shared/errors";
import { readFormDataWithin } from "@sellbridge/shared/http-body";
import {
  adminProductReasonSchema,
  adminSellerProductScopeSchema,
} from "@sellbridge/shared/seller-catalog-schemas";
import { database } from "@/lib/server/database";
import { assertOwnProductsClosed } from "./own-products-closed";
import { environment } from "@/lib/server/environment";
import { assertSameOrigin, handleApi, jsonResponse } from "@/lib/server/http";
import { fileStorage } from "@/lib/server/storage";
import { requireAdminSession, requireTenantRequest } from "@/lib/server/tenant-session";
import { assertUploadAllowed, productImageUploads } from "@/lib/server/upload-rate-limit";
import { checkProductImageBytes } from "@/features/supplier-panel/catalog/product-image-check";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
  productImageStorageKey,
  productImageUrl,
} from "@/features/supplier-panel/catalog/product-image-key";

/**
 * MVP (2026-10-22): a reseller can no longer upload images of own products. This route refuses
 * every call on its own, so the refusal never depends on the session's shape.
 */
export function refuseSellerProductImage(request: Request) {
  return handleApi("seller_products.image_upload", async () => {
    assertSameOrigin(request, environment.APP_URL);
    const session = await requireTenantRequest(request);
    return assertOwnProductsClosed("image_upload", session.tenantId);
  });
}

/** The URL fixes the access mode; submitted source identifiers are never trusted. */
export function handleSellerProductImage(request: Request, admin: boolean) {
  return handleApi("seller_products.image_upload", async () => {
    assertSameOrigin(request, environment.APP_URL);
    const session = admin
      ? await requireAdminSession(request.headers)
      : await requireTenantRequest(request);
    if (
      "profileKind" in session &&
      (session.profileKind !== "seller" || session.impersonatedBy !== null)
    )
      throw forbiddenError("Use o painel de produtos autorizado para esta conta.");
    assertUploadAllowed(productImageUploads, session.userId);
    const form = await readFormDataWithin(request, MAX_PRODUCT_IMAGE_BYTES + 64 * 1024);
    if (form === null) throw validationError("As imagens devem ter no máximo 5 MB.");
    const scope = adminSellerProductScopeSchema
      .extend({ reason: adminProductReasonSchema })
      .safeParse({ tenantId: form.get("tenantId"), reason: form.get("reason") });
    if (admin && !scope.success)
      throw validationError("Selecione uma conta de revendedor e informe o motivo do envio.");
    const tenantId =
      admin && scope.success ? scope.data.tenantId : "tenantId" in session ? session.tenantId : "";
    const reason = admin && scope.success ? scope.data.reason : null;
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_PRODUCT_IMAGE_BYTES)
      throw validationError("Selecione uma imagem PNG, JPG ou WebP de até 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = checkProductImageBytes(bytes);
    const source = await ensureSellerCatalog(database, tenantId);
    const fileName = `${randomUUID()}.${PRODUCT_IMAGE_TYPES[type]}`;
    const key = productImageStorageKey({ supplierId: source.id, fileName });
    await fileStorage.put(key, bytes);
    try {
      if (admin)
        await database.insert(adminAuditEvents).values({
          adminId: session.userId,
          entityType: "supplier",
          entityId: source.id,
          action: "product.seller_image_uploaded",
          details: { tenantId, reason, bytes: bytes.byteLength },
        });
    } catch (error) {
      await fileStorage.delete(key);
      throw error;
    }
    return jsonResponse(200, { url: productImageUrl(environment.APP_URL, source.id, fileName) });
  });
}
