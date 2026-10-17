import { formatCents } from "@sellbridge/shared/money";
import type { RejectionReason } from "@sellbridge/shared/supplier-panel-catalog-status";
import { formatAttributeValue } from "@sellbridge/shared/supplier-product-attributes";
import { reviewFieldLabel, reviewReasonTitle } from "@sellbridge/shared/supplier-product-review";

/** What a resubmission check reads from the product under review. */
export interface ResubmittedProduct {
  title: string;
  description: string;
  sku: string;
  costCents: number;
  suggestedPriceCents: number;
  stock: number;
  imageUrls: readonly string[];
  categoryName: string | null;
  mercadoLivreAttributes: Readonly<Record<string, string>>;
  rejectionReasons: readonly RejectionReason[];
  completeness: {
    blocking: readonly { field: string; rule: string }[];
    improvements: readonly { field: string; rule: string }[];
  };
}

export interface ResubmissionCheck {
  key: string;
  title: string;
  fieldLabel: string;
  message: string;
  /** The field as it is now, in words; null when it is empty. */
  currentValue: string | null;
  /** The same completeness problem the reason came from is still there. */
  stillFlagged: boolean;
}

const ATTRIBUTE_PREFIX = "attributes.";

function nonEmpty(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function attributeValue(product: ResubmittedProduct, id: string): string | null {
  const value = nonEmpty(product.mercadoLivreAttributes[id] ?? "");
  return value === null ? null : formatAttributeValue(id, value);
}

function imageCount(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1 ? "1 imagem" : `${count} imagens`;
}

/** The current value of the field a reason points at, as the reviewer would read it. */
function currentValueOf(product: ResubmittedProduct, field: string): string | null {
  if (field.startsWith(ATTRIBUTE_PREFIX)) {
    return attributeValue(product, field.slice(ATTRIBUTE_PREFIX.length));
  }
  const readers: Readonly<Record<string, () => string | null>> = {
    title: () => nonEmpty(product.title),
    description: () => nonEmpty(product.description),
    sku: () => nonEmpty(product.sku),
    costCents: () => formatCents(product.costCents),
    suggestedPriceCents: () => formatCents(product.suggestedPriceCents),
    stock: () => `${product.stock} un.`,
    imageUrls: () => imageCount(product.imageUrls.length),
    categoryId: () => product.categoryName,
  };
  return readers[field]?.() ?? null;
}

/**
 * For a product sent again after a rejection: each reason of the last rejection, with the
 * field as it is now and whether its completeness problem is still open. Nothing stores the
 * values at rejection time, so the reviewer compares the reason with the field as it stands.
 */
export function resubmissionChecks(product: ResubmittedProduct): ResubmissionCheck[] {
  const openIssues = [...product.completeness.blocking, ...product.completeness.improvements];
  return product.rejectionReasons.map((reason, index) => ({
    key: `${index}-${reason.field}-${reason.rule}`,
    title: reviewReasonTitle(reason.rule),
    fieldLabel: reviewFieldLabel(reason.field),
    message: reason.message,
    currentValue: currentValueOf(product, reason.field),
    stillFlagged: openIssues.some(
      (issue) => issue.field === reason.field && issue.rule === reason.rule,
    ),
  }));
}
