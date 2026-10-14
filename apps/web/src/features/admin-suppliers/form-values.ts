import type { AdminSupplier, AdminSupplierProduct } from "@sellbridge/database/repositories";
import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import type { z } from "zod";

export function catalogFormErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    const message = /^(Invalid|Too|Expected)\b/.test(issue.message)
      ? "Valor inválido. Revise este campo."
      : issue.message;
    errors[field] = [...(errors[field] ?? []), message];
  }
  return errors;
}

export interface CoverageDraft {
  state: string;
  city: string;
}
export function supplierFormValues(detail?: {
  supplier: AdminSupplier;
  coverage: { state: string; city: string | null }[];
}) {
  const supplier = detail?.supplier;
  return {
    name: supplier?.name ?? "",
    niche: supplier?.niche ?? "",
    state: supplier?.state ?? "SP",
    city: supplier?.city ?? "",
    description: supplier?.description ?? "",
    logoUrl: supplier?.logoUrl ?? "",
    coverage: detail?.coverage.map((region) => ({
      state: region.state,
      city: region.city ?? "",
    })) ?? [{ state: "SP", city: "" }],
  };
}

export function productFormValues(product?: AdminSupplierProduct) {
  return {
    sku: product?.sku ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    cost: formatCentsForInput(product?.costCents ?? 0),
    suggestedPrice: formatCentsForInput(product?.suggestedPriceCents ?? 0),
    stock: String(product?.stock ?? 0),
    categoryId: product?.categoryId ?? "",
    images: product?.imageUrls.join("\n") ?? "",
    mercadoLivreAttributes: Object.entries(product?.mercadoLivreAttributes ?? {})
      .map(([id, value]) => `${id}=${value}`)
      .join("\n"),
  };
}

export function productFormInput(
  values: ReturnType<typeof productFormValues>,
  supplierId: string,
  product: Pick<AdminSupplierProduct, "id" | "stock"> | undefined,
) {
  return {
    supplierId,
    productId: product?.id,
    expectedStock: product?.stock,
    sku: values.sku,
    title: values.title,
    description: values.description,
    costCents: parseCsvMoney(values.cost),
    suggestedPriceCents: parseCsvMoney(values.suggestedPrice),
    stock: /^\d+$/.test(values.stock) ? Number(values.stock) : null,
    categoryId: values.categoryId || null,
    mercadoLivreAttributes: parseMercadoLivreAttributes(values.mercadoLivreAttributes),
    imageUrls: values.images
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean),
  };
}

/** Invalid or duplicate lines remain invalid input for the shared schema. */
function parseMercadoLivreAttributes(text: string): Record<string, string> | null {
  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const line of text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    const separator = line.indexOf("=");
    const id = line.slice(0, separator).trim();
    if (separator < 1 || seen.has(id)) return null;
    seen.add(id);
    entries.push([id, line.slice(separator + 1).trim()]);
  }
  return Object.fromEntries(entries);
}
