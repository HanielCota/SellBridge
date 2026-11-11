import { parseBrlToCents } from "@sellbridge/shared/money";
import {
  MANUAL_SALE_MAX_ITEMS,
  manualSaleSchema,
  type ManualSale,
  type ManualSaleChannel,
} from "@sellbridge/shared/schemas";
import { formatCentsForField } from "@/lib/currency-mask";

/** A product picked from the search, as the form keeps it while the reseller types. */
export interface DraftItem {
  readonly productId: string;
  readonly title: string;
  readonly supplierName: string;
  readonly stock: number;
  /** What the reseller types: the quantity and the price ("49,90"). */
  readonly quantity: string;
  readonly price: string;
}

export interface ManualSaleDraft {
  readonly channel: ManualSaleChannel;
  readonly externalOrderId: string;
  readonly buyerName: string;
  readonly items: readonly DraftItem[];
}

export const EMPTY_MANUAL_SALE: ManualSaleDraft = {
  channel: "shopee",
  externalOrderId: "",
  buyerName: "",
  items: [],
};

/** Field errors by name: "externalOrderId", "items", "items.0.quantity"... */
export type DraftErrors = Readonly<Record<string, string>>;

export function addDraftItem(
  draft: ManualSaleDraft,
  product: {
    id: string;
    title: string;
    supplierName: string;
    stock: number;
    suggestedPriceCents: number;
  },
): ManualSaleDraft {
  if (draft.items.some((item) => item.productId === product.id)) {
    return draft;
  }
  if (draft.items.length >= MANUAL_SALE_MAX_ITEMS) {
    return draft;
  }
  const item: DraftItem = {
    productId: product.id,
    title: product.title,
    supplierName: product.supplierName,
    stock: product.stock,
    quantity: "1",
    price: formatCentsForField(product.suggestedPriceCents),
  };
  return { ...draft, items: [...draft.items, item] };
}

export function updateDraftItem(
  draft: ManualSaleDraft,
  productId: string,
  patch: Partial<Pick<DraftItem, "quantity" | "price">>,
): ManualSaleDraft {
  return {
    ...draft,
    items: draft.items.map((item) => (item.productId === productId ? { ...item, ...patch } : item)),
  };
}

export function removeDraftItem(draft: ManualSaleDraft, productId: string): ManualSaleDraft {
  return { ...draft, items: draft.items.filter((item) => item.productId !== productId) };
}

function quantityOf(item: DraftItem): number {
  const digits = item.quantity.trim();
  return /^\d+$/.test(digits) ? Number.parseInt(digits, 10) : Number.NaN;
}

function priceOf(item: DraftItem): number {
  return parseBrlToCents(item.price) ?? Number.NaN;
}

/** The sale total in cents, or null while a quantity or price is not a number yet. */
export function draftTotalCents(draft: ManualSaleDraft): number | null {
  let total = 0;
  for (const item of draft.items) {
    const line = quantityOf(item) * priceOf(item);
    if (!Number.isFinite(line)) {
      return null;
    }
    total += line;
  }
  return total;
}

/** The sale to send, or the message of each field to fix, next to that field. */
export function readManualSale(
  draft: ManualSaleDraft,
): { sale: ManualSale; errors: null } | { sale: null; errors: DraftErrors } {
  const parsed = manualSaleSchema.safeParse({
    channel: draft.channel,
    externalOrderId: draft.externalOrderId,
    buyerName: draft.buyerName,
    items: draft.items.map((item) => ({
      productId: item.productId,
      quantity: quantityOf(item),
      unitPriceCents: priceOf(item),
    })),
  });
  if (parsed.success) {
    return { sale: parsed.data, errors: null };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return { sale: null, errors };
}

/** The errors left once these fields changed: "items" also drops each product's own errors. */
export function withoutErrors(errors: DraftErrors, changedFields: readonly string[]): DraftErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) => !changedFields.some((field) => key === field || key.startsWith(`${field}.`)),
    ),
  );
}
