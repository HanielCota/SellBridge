import type { AdminSupplier, AdminSupplierProduct } from "@sellbridge/database/repositories";
import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import { SUPPLIER_SLA_DEFAULTS } from "@sellbridge/shared/schemas";
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

export function supplierFormValues(detail?: { supplier: AdminSupplier }) {
  const supplier = detail?.supplier;
  return {
    name: supplier?.name ?? "",
    niche: supplier?.niche ?? "",
    state: supplier?.state ?? "SP",
    city: supplier?.city ?? "",
    description: supplier?.description ?? "",
    logoUrl: supplier?.logoUrl ?? "",
    contactEmail: supplier?.contactEmail ?? "",
    acceptWithinHours: String(
      supplier?.acceptWithinHours ?? SUPPLIER_SLA_DEFAULTS.acceptWithinHours,
    ),
    dispatchWithinHours: String(
      supplier?.dispatchWithinHours ?? SUPPLIER_SLA_DEFAULTS.dispatchWithinHours,
    ),
  };
}

/** Hours typed in the form: digits only, so "dois dias" is rejected instead of guessed. */
function hoursInput(text: string): number | string {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** What the supplier form sends to `adminSaveSupplierSchema`. */
export function supplierFormInput(
  values: ReturnType<typeof supplierFormValues>,
  supplierId: string | undefined,
) {
  return {
    ...values,
    supplierId,
    logoUrl: values.logoUrl.trim() || null,
    contactEmail: values.contactEmail.trim() || null,
    acceptWithinHours: hoursInput(values.acceptWithinHours),
    dispatchWithinHours: hoursInput(values.dispatchWithinHours),
  };
}

export function productFormValues(product?: AdminSupplierProduct) {
  return {
    sku: product?.sku ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    // A new product starts with no cost: "0,00" was saved as a real cost of zero.
    cost: product === undefined ? "" : formatCentsForInput(product.costCents),
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
    // Negative only when shipments outran the count; the schema refuses typing a new one.
    stock: /^-?\d+$/.test(values.stock) ? Number(values.stock) : null,
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
