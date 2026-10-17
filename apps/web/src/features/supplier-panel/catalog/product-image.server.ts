import { randomUUID } from "node:crypto";
import { assertPanelSupplier } from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { detectAttachmentType, hasAcceptableImageSize } from "@sellbridge/shared/file-signature";
import { readFormDataWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { assertSameOrigin, handleApi, jsonResponse } from "@/lib/server/http";
import { assertSupplierPanelAccess } from "@/lib/server/supplier-panel-access";
import { resolveSupplierPanelViewer } from "@/lib/server/supplier-panel-viewer";
import { requireTenantRequest } from "@/lib/server/tenant-session";
import { assertUploadAllowed, productImageUploads } from "@/lib/server/upload-rate-limit";
import { fileStorage } from "@/lib/server/storage";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_TYPES,
  productImagePathSchema,
  productImageStorageKey,
  productImageUrl,
  type ProductImageType,
} from "./product-image-key";

const TOO_LARGE = "A imagem deve ter no máximo 5 MB";
const supplierIdSchema = z.uuid("Fornecedor inválido");

function isProductImageType(type: string | null): type is ProductImageType {
  return type !== null && type in PRODUCT_IMAGE_TYPES;
}

async function readProductImage(request: Request) {
  // Room for the multipart framing around a photo at the size limit.
  const form = await readFormDataWithin(request, MAX_PRODUCT_IMAGE_BYTES + 64 * 1024);
  if (!form) {
    throw validationError(TOO_LARGE);
  }
  const rawSupplierId = form.get("supplierId");
  const supplierId = supplierIdSchema.safeParse(rawSupplierId);
  if (!supplierId.success) {
    const received = typeof rawSupplierId === "string" ? rawSupplierId : "um arquivo";
    throw validationError(`Fornecedor inválido (recebido: ${received})`);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw validationError("Escolha uma imagem para enviar");
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw validationError(TOO_LARGE);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectAttachmentType(bytes);
  if (!isProductImageType(type)) {
    throw validationError("Envie uma imagem PNG, JPG ou WEBP");
  }
  if (!hasAcceptableImageSize(bytes, type)) {
    throw validationError("A imagem é grande demais: envie uma de até 64 megapixels");
  }
  return { supplierId: supplierId.data, bytes, type };
}

/**
 * POST /api/fornecedor/produtos/imagens: multipart "supplierId" and "file"; answers the
 * public link of the stored photo. Same access as the panel functions: the supplier profile
 * for its own catalog, or the team for any supplier (`supplierPanelMiddleware`).
 */
export function handleUploadProductImage(request: Request) {
  return handleApi("supplier_panel.upload_product_image", async () => {
    assertSameOrigin(request, environment.APP_URL);
    const session = await requireTenantRequest(request);
    assertUploadAllowed(productImageUploads, session.userId);
    const { supplierId, bytes, type } = await readProductImage(request);
    assertSupplierPanelAccess(await resolveSupplierPanelViewer(session), supplierId);
    await assertPanelSupplier(database, supplierId);
    const fileName = `${randomUUID()}.${PRODUCT_IMAGE_TYPES[type]}`;
    await fileStorage.put(productImageStorageKey({ supplierId, fileName }), bytes);
    logger.info("supplier_panel.product_image_uploaded", { supplierId, bytes: bytes.byteLength });
    return jsonResponse(200, { url: productImageUrl(environment.APP_URL, supplierId, fileName) });
  });
}

/**
 * GET /api/produtos/imagens/:supplierId/:fileName: public, because the marketplaces fetch the
 * photo of a listing without a session, as they do any image link a supplier pastes.
 */
export function handleGetProductImage(params: {
  supplierId?: string;
  fileName?: string;
}): Promise<Response> {
  return handleApi("supplier_panel.get_product_image", async () => {
    const parsed = productImagePathSchema.safeParse(params);
    if (!parsed.success) {
      return jsonResponse(404, { error: "Imagem não encontrada" });
    }
    const bytes = await fileStorage.get(productImageStorageKey(parsed.data));
    if (bytes === null) {
      return jsonResponse(404, { error: "Imagem não encontrada" });
    }
    const extension = parsed.data.fileName.split(".").at(-1);
    const type = Object.entries(PRODUCT_IMAGE_TYPES).find(([, value]) => value === extension)?.[0];
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": type ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
        // Every upload gets a new file name, so the link never changes content.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });
}
