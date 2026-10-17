import { z } from "zod";

/**
 * Where a product photo the supplier sent from the device lives: on disk (or the bucket that
 * replaces it) under the supplier's folder, and on a public link the marketplaces can fetch.
 */
export const PRODUCT_IMAGE_PATH = "/api/produtos/imagens";

export const PRODUCT_IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type ProductImageType = keyof typeof PRODUCT_IMAGE_TYPES;

/** Marketplaces take photos up to 10 MB; 5 MB keeps a phone photo and spares the disk. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const productImagePathSchema = z.object({
  supplierId: z.uuid(),
  fileName: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|webp)$/),
});
export type ProductImagePath = z.infer<typeof productImagePathSchema>;

export function productImageStorageKey(path: ProductImagePath): string {
  return `product-images/${path.supplierId}/${path.fileName}`;
}

export function productImageUrl(applicationUrl: string, supplierId: string, fileName: string) {
  return new URL(`${PRODUCT_IMAGE_PATH}/${supplierId}/${fileName}`, applicationUrl).toString();
}
