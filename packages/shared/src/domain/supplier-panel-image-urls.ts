import { z } from "zod";
import type { ProductCsvError, ProductCsvRow } from "./product-csv.ts";

/**
 * Supplier photos must be https: marketplaces refuse plain http pictures, and the import guide
 * promises "Até 20 links https". Staff keeps `https?` (`imageUrlSchema` in admin-suppliers).
 * Loopback hosts stay allowed: in development the app's own uploads live on http://localhost.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_IMAGE_URL_LENGTH = 2000;

export function isSupplierImageUrl(text: string): boolean {
  if (!URL.canParse(text)) {
    return false;
  }
  const url = new URL(text);
  if (url.protocol === "https:") {
    return true;
  }
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

export function shortValue(value: unknown): string {
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

export const supplierImageUrlSchema = z
  .string()
  .max(MAX_IMAGE_URL_LENGTH, "Use um link de imagem mais curto")
  .refine(isSupplierImageUrl, {
    error: (issue) =>
      `Link de imagem inválido (recebido: "${shortValue(issue.input)}"); esperado: um link que comece com https://`,
  });

export const supplierImageUrlsSchema = z.array(supplierImageUrlSchema).max(20);

/** Same reason product-csv gives a bad cell, so the import explains it with the column guide. */
const INSECURE_IMAGE_REASON = "Imagens: valor inválido";

/** The first photo of the rows that is not https, or null when every one is. */
export function firstInsecureImageUrl(rows: readonly ProductCsvRow[]): string | null {
  const urls = rows.flatMap((row) => row.product.imageUrls);
  return urls.find((url) => !isSupplierImageUrl(url)) ?? null;
}

/** Rows product-csv accepted whose photos are not https, for the supplier's import only. */
export function insecureImageErrors(rows: readonly ProductCsvRow[]): ProductCsvError[] {
  return rows
    .filter((row) => !row.product.imageUrls.every(isSupplierImageUrl))
    .map((row) => ({ line: row.line, reason: INSECURE_IMAGE_REASON }));
}
