import { z } from "zod";
import { conflictError, validationError } from "../runtime/errors.ts";
import { freeText } from "../schemas/common.ts";
import { formatCents, type Cents } from "./money.ts";
import { brazilDay, shiftDay, weekdayOfDay } from "./support-performance/calendar.ts";

/*
 * The return policy (Guilherme, 18/11/2026). A returned parcel goes back to whoever's address the
 * store gives the marketplace: usually the supplier's, sometimes the reseller's. The reseller says
 * why the buyer sent it back; the supplier checks the product by a deadline. No answer in time
 * means the reseller's version stands; a disagreement goes to the team. The supplier always gives
 * back the cost the reseller paid; who pays the return shipping depends on the reason. The money
 * itself does not move yet: each closed return records what the supplier owes.
 */

export const RETURN_REASONS = [
  "defect",
  "damaged",
  "wrong_item",
  "regret",
  "not_delivered",
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defect: "Defeito no produto",
  damaged: "Chegou avariado",
  wrong_item: "Produto errado",
  regret: "O comprador desistiu",
  not_delivered: "Não foi entregue ao comprador",
};

/** Reasons the supplier is blamed for: the reseller has to show photos. */
const REASONS_NEEDING_PHOTOS: ReadonlySet<ReturnReason> = new Set([
  "defect",
  "damaged",
  "wrong_item",
]);

export function reasonNeedsPhotos(reason: ReturnReason): boolean {
  return REASONS_NEEDING_PHOTOS.has(reason);
}

export type ShippingPayer = "supplier" | "seller";

/** The supplier's fault pays the trip back; a buyer who gave up costs the reseller's store. */
const SHIPPING_PAYER: Record<ReturnReason, ShippingPayer> = {
  defect: "supplier",
  damaged: "supplier",
  wrong_item: "supplier",
  regret: "seller",
  not_delivered: "seller",
};

export function returnShippingPayer(reason: ReturnReason): ShippingPayer {
  return SHIPPING_PAYER[reason];
}

/** What the "can it be sold again?" question starts with; the supplier has the last word. */
const RESELLABLE_BY_DEFAULT: Record<ReturnReason, boolean> = {
  defect: false,
  damaged: false,
  wrong_item: true,
  regret: true,
  not_delivered: true,
};

export function resellableByDefault(reason: ReturnReason): boolean {
  return RESELLABLE_BY_DEFAULT[reason];
}

/** A return the reseller never explained is the cheapest case for the supplier. */
export const REASON_WHEN_UNSTATED: ReturnReason = "regret";

/** Mirrors the `return_claims.policy_step` check constraint. */
export const RETURN_STEPS = [
  "awaiting_supplier",
  "awaiting_forward",
  "forwarded",
  "disputed",
  "closed",
] as const;
export type ReturnStep = (typeof RETURN_STEPS)[number];

/** Whose address the parcel went back to. */
export const RETURN_DESTINATIONS = ["supplier", "seller"] as const;
export type ReturnDestination = (typeof RETURN_DESTINATIONS)[number];

export const SUPPLIER_VERDICTS = ["as_described", "not_as_described", "not_received"] as const;
export type SupplierVerdict = (typeof SUPPLIER_VERDICTS)[number];

export const CLOSE_REASONS = [
  "supplier_agreed",
  "supplier_silent",
  "team_decided",
  "not_forwarded",
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const ANSWER_BUSINESS_DAYS_MIN = 1;
export const ANSWER_BUSINESS_DAYS_MAX = 5;
export const ANSWER_BUSINESS_DAYS_DEFAULT = 3;
/** Days the reseller has to send a parcel that came back to it on to the supplier. */
export const FORWARD_WINDOW_DAYS = 7;
/** The supplier answers a day before the marketplace's date, so the reseller still has a day. */
const MARKETPLACE_MARGIN_IN_MS = 24 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const REASON_NOTE_MAX = 500;
export const CONDITION_MIN = 5;
export const CONDITION_MAX = 500;
export const TRACKING_CODE_MIN = 4;
export const TRACKING_CODE_MAX = 60;
/** R$ 1.000,00: far above any return label, low enough to catch a typo. */
export const RETURN_SHIPPING_MAX_CENTS = 100_000;

/** Saturday and Sunday, with Monday = 0. */
const FIRST_WEEKEND_DAY = 5;

// Brazil has had no daylight saving time since 2019, so Brasília midnight is always UTC−3.
function startOfBrazilDay(day: string): Date {
  return new Date(`${day}T00:00:00-03:00`);
}

function assertValidDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw validationError(`Invalid ${label}: got ${String(date)}, expected a valid Date.`);
  }
}

/**
 * Midnight after the `businessDays`-th business day following `from`'s day, in Brasília. A parcel
 * in on Friday with 3 business days is on time until Wednesday ends. Holidays still count.
 *
 * @throws {AppError} VALIDATION when `from` is invalid or `businessDays` is outside 1–5.
 */
export function addBusinessDays(from: Date, businessDays: number): Date {
  assertValidDate(from, "start date for business days");
  assertAnswerBusinessDays(businessDays);
  let day = brazilDay(from);
  let counted = 0;
  while (counted < businessDays) {
    day = shiftDay(day, 1);
    if (weekdayOfDay(day) < FIRST_WEEKEND_DAY) {
      counted += 1;
    }
  }
  return startOfBrazilDay(shiftDay(day, 1));
}

/** @throws {AppError} VALIDATION when the setting is not a whole number between 1 and 5. */
export function assertAnswerBusinessDays(businessDays: number): number {
  if (
    !Number.isInteger(businessDays) ||
    businessDays < ANSWER_BUSINESS_DAYS_MIN ||
    businessDays > ANSWER_BUSINESS_DAYS_MAX
  ) {
    throw validationError(
      `O prazo vai de ${ANSWER_BUSINESS_DAYS_MIN} a ${ANSWER_BUSINESS_DAYS_MAX} dias úteis (recebido: ${businessDays})`,
    );
  }
  return businessDays;
}

/**
 * When the supplier's answer becomes late. With the marketplace's review date, a day before it;
 * without one (manual sales, other channels), the admin's business days from the parcel's arrival.
 */
export function supplierAnswerDeadline(input: {
  arrivedAt: Date;
  marketplaceDueAt: Date | null;
  businessDays: number;
}): Date {
  if (input.marketplaceDueAt !== null) {
    assertValidDate(input.marketplaceDueAt, "marketplace review date");
    return new Date(input.marketplaceDueAt.getTime() - MARKETPLACE_MARGIN_IN_MS);
  }
  return addBusinessDays(input.arrivedAt, input.businessDays);
}

/** The last moment to send a parcel that came back to the reseller on to the supplier. */
export function forwardDeadline(arrivedAt: Date): Date {
  assertValidDate(arrivedAt, "arrival date");
  return new Date(arrivedAt.getTime() + FORWARD_WINDOW_DAYS * DAY_IN_MS);
}

export interface SupplierObligation {
  costCents: Cents;
  shippingCents: Cents;
  shippingPayer: ShippingPayer;
}

/**
 * What the supplier owes when the reseller's version stands: always the cost the reseller paid,
 * plus the return label when the reason is the supplier's fault.
 */
export function supplierObligation(input: {
  reason: ReturnReason | null;
  supplierCostCents: Cents;
  returnShippingCents: Cents | null;
}): SupplierObligation {
  const shippingPayer = returnShippingPayer(input.reason ?? REASON_WHEN_UNSTATED);
  const shippingCents = shippingPayer === "supplier" ? (input.returnShippingCents ?? 0) : 0;
  return { costCents: input.supplierCostCents, shippingCents, shippingPayer };
}

/** "Fornecedor deve R$ 80,00 de custo + R$ 22,90 de frete". */
export function obligationText(obligation: { costCents: Cents; shippingCents: Cents }): string {
  const cost = `Fornecedor deve ${formatCents(obligation.costCents)} de custo`;
  if (obligation.shippingCents === 0) {
    return cost;
  }
  return `${cost} + ${formatCents(obligation.shippingCents)} de frete`;
}

/** Steps where the reseller can still tell (or correct) why the buyer sent it back. */
const REASON_OPEN_STEPS: ReadonlySet<ReturnStep> = new Set([
  "awaiting_supplier",
  "awaiting_forward",
  "forwarded",
]);

/** @throws {AppError} CONFLICT once the supplier answered or the return is closed. */
export function assertReasonCanChange(step: ReturnStep, supplierAnswered: boolean): void {
  if (!REASON_OPEN_STEPS.has(step) || supplierAnswered) {
    throw conflictError("O fornecedor já respondeu esta devolução: o motivo não muda mais");
  }
}

/** @throws {AppError} CONFLICT when the return is not at `expected`. */
export function assertStep(step: ReturnStep | null, expected: ReturnStep, action: string): void {
  if (step !== expected) {
    throw conflictError(`Não dá para ${action} agora: a devolução já mudou de etapa`);
  }
}

/** Whether a deadline has passed at `now`. A missing deadline never expires. */
export function isPastDeadline(deadline: Date | null, now: Date): boolean {
  return deadline !== null && now.getTime() >= deadline.getTime();
}

const shippingCentsField = z
  .number()
  .int("Informe o frete em reais e centavos")
  .min(0, "O frete não pode ser negativo")
  .max(
    RETURN_SHIPPING_MAX_CENTS,
    `Confira o frete: o máximo é ${formatCents(RETURN_SHIPPING_MAX_CENTS)}`,
  );

/** The reseller's side: why the buyer sent it back, and what the return label cost the store. */
export const statedReasonSchema = z.object({
  claimId: z.uuid(),
  reason: z.enum(RETURN_REASONS, "Escolha o motivo da devolução"),
  note: freeText().trim().max(REASON_NOTE_MAX, `Use até ${REASON_NOTE_MAX} caracteres`),
  returnShippingCents: shippingCentsField.nullable(),
});
export type StatedReason = z.infer<typeof statedReasonSchema>;

/** The supplier's side, after looking at the product. */
export const supplierAnswerSchema = z
  .object({
    claimId: z.uuid(),
    verdict: z.enum(["as_described", "not_as_described"], "Diga se o produto está como descrito"),
    condition: freeText().trim().max(CONDITION_MAX, `Use até ${CONDITION_MAX} caracteres`),
    resellable: z.boolean("Diga se o produto pode ser vendido de novo"),
  })
  .refine(
    (answer) => answer.verdict === "as_described" || answer.condition.length >= CONDITION_MIN,
    { path: ["condition"], message: "Conte em poucas palavras como o produto chegou" },
  );
export type SupplierAnswer = z.infer<typeof supplierAnswerSchema>;

export const forwardSchema = z.object({
  claimId: z.uuid(),
  trackingCode: freeText()
    .trim()
    .min(TRACKING_CODE_MIN, "Informe o código de rastreio do reenvio")
    .max(TRACKING_CODE_MAX, `Use até ${TRACKING_CODE_MAX} caracteres`),
});

export const claimActionSchema = z.object({ claimId: z.uuid() });

export const answerBusinessDaysSchema = z.object({
  businessDays: z
    .number()
    .int("Use um número inteiro de dias")
    .min(ANSWER_BUSINESS_DAYS_MIN, `O mínimo é ${ANSWER_BUSINESS_DAYS_MIN} dia útil`)
    .max(ANSWER_BUSINESS_DAYS_MAX, `O máximo é ${ANSWER_BUSINESS_DAYS_MAX} dias úteis`),
});
