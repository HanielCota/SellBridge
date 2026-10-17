import { z } from "zod";

/**
 * Review lifecycle of a supplier's product in the supplier panel. Only `approved` products reach
 * the resellers' catalog; rows created before the panel existed were backfilled as approved.
 */
export const PRODUCT_REVIEW_STATUSES = ["draft", "in_review", "approved", "rejected"] as const;
export type ProductReviewStatus = (typeof PRODUCT_REVIEW_STATUSES)[number];
export const productReviewStatusSchema = z.enum(PRODUCT_REVIEW_STATUSES);

export const PRODUCT_REVIEW_STATUS_LABELS: Readonly<Record<ProductReviewStatus, string>> = {
  draft: "Rascunho",
  in_review: "Em análise",
  approved: "Aprovado",
  rejected: "Reprovado",
};

/**
 * Where a completeness issue or a rejection reason points: a product column, or one Mercado
 * Livre attribute as `attributes.<ID>`. The form uses it to jump to the exact field.
 */
export const productFieldKeySchema = z
  .string()
  .regex(
    /^(sku|title|description|costCents|suggestedPriceCents|stock|categoryId|imageUrls|attributes\.[A-Z][A-Z0-9_]{0,99})$/,
    "Use um campo do produto, como title ou attributes.BRAND",
  );
export type ProductFieldKey = z.infer<typeof productFieldKeySchema>;

const MAX_REJECTION_REASONS = 20;

/** Why a reviewer refused a product: the field, the rule it broke and what to fix, in pt-BR. */
export const rejectionReasonSchema = z.object({
  field: productFieldKeySchema,
  rule: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,59}$/, "Use um código de regra, como image_quality"),
  message: z
    .string()
    .trim()
    .min(5, "Explique o motivo em pelo menos 5 caracteres")
    .max(500, "Use até 500 caracteres no motivo"),
});
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;
export const rejectionReasonsSchema = z
  .array(rejectionReasonSchema)
  .min(1, "Informe pelo menos um motivo da reprovação")
  .max(MAX_REJECTION_REASONS, `Informe no máximo ${MAX_REJECTION_REASONS} motivos`);

/** Fields whose change on an approved product needs a new review (what the buyer sees first). */
const REVIEWED_FIELDS: ReadonlySet<string> = new Set(["title", "imageUrls", "categoryId"]);

export type TransitionResult =
  | { readonly allowed: true; readonly next: ProductReviewStatus }
  | { readonly allowed: false; readonly message: string };

/** Draft → in review, only with nothing that blocks publishing. */
export function submitTransition(
  current: ProductReviewStatus,
  blockingIssueCount: number,
): TransitionResult {
  if (current !== "draft") {
    return {
      allowed: false,
      message: `Só um rascunho pode ser enviado para análise (status atual: ${PRODUCT_REVIEW_STATUS_LABELS[current]})`,
    };
  }
  if (blockingIssueCount > 0) {
    return {
      allowed: false,
      message: `Corrija ${blockingIssueCount} ${blockingIssueCount === 1 ? "pendência que impede" : "pendências que impedem"} publicar antes de enviar`,
    };
  }
  return { allowed: true, next: "in_review" };
}

/** In review → approved or rejected; the reviewer decides only on products waiting for them. */
export function reviewTransition(
  current: ProductReviewStatus,
  decision: "approve" | "reject",
): TransitionResult {
  if (current !== "in_review") {
    return {
      allowed: false,
      message: `Só um produto em análise pode ser avaliado (status atual: ${PRODUCT_REVIEW_STATUS_LABELS[current]})`,
    };
  }
  return { allowed: true, next: decision === "approve" ? "approved" : "rejected" };
}

/**
 * The status a product moves to when the supplier saves an edit. A rejected product becomes a
 * draft again; an approved one goes back to review when what buyers see first changed, never for
 * stock or cost. A product under review with something blocking falls back to draft.
 */
export function statusAfterEdit(input: {
  current: ProductReviewStatus;
  changedFields: readonly string[];
  blockingIssueCount: number;
}): ProductReviewStatus {
  if (input.changedFields.length === 0) {
    return input.current;
  }
  if (input.current === "rejected") {
    return "draft";
  }
  if (input.current === "draft") {
    return "draft";
  }
  const needsReview =
    input.current === "in_review" ||
    input.changedFields.some((field) => REVIEWED_FIELDS.has(field));
  if (!needsReview) {
    return input.current;
  }
  return input.blockingIssueCount > 0 ? "draft" : "in_review";
}

/** The product fields a supplier edits, compared to tell which ones a save changed. */
export interface EditableProductFields {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  readonly costCents: number;
  readonly suggestedPriceCents: number;
  readonly stock: number;
  readonly categoryId: string | null;
  readonly imageUrls: readonly string[];
  readonly mercadoLivreAttributes: Readonly<Record<string, string>>;
}

function sameAttributes(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

/** Field keys whose value differs between the stored product and the incoming edit. */
export function changedProductFields(
  before: EditableProductFields,
  after: EditableProductFields,
): string[] {
  const scalarKeys = [
    "sku",
    "title",
    "description",
    "costCents",
    "suggestedPriceCents",
    "stock",
    "categoryId",
  ] as const;
  const changed: string[] = scalarKeys.filter((key) => before[key] !== after[key]);
  const sameImages =
    before.imageUrls.length === after.imageUrls.length &&
    before.imageUrls.every((url, index) => after.imageUrls[index] === url);
  if (!sameImages) {
    changed.push("imageUrls");
  }
  if (!sameAttributes(before.mercadoLivreAttributes, after.mercadoLivreAttributes)) {
    changed.push("mercadoLivreAttributes");
  }
  return changed;
}
