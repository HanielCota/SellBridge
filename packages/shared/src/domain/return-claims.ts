import { z } from "zod";
import { conflictError, validationError } from "../runtime/errors.ts";
import { freeText } from "../schemas/common.ts";
import { formatCents, type Cents } from "./money.ts";

/*
 * A parcel that came back opens a claim with its supplier: the reseller already paid the
 * supplier's cost for that order, and the team decides whether the supplier gives it back.
 * The decision is a recorded credit balance only; no money moves through Stripe or a payout yet.
 */

/** Mirrors the `return_claims.status` check constraint. */
export const RETURN_CLAIM_STATUSES = ["in_review", "credited", "refused"] as const;
export type ReturnClaimStatus = (typeof RETURN_CLAIM_STATUSES)[number];

export const RETURN_CLAIM_STATUS_LABELS: Record<ReturnClaimStatus, string> = {
  in_review: "Em análise",
  credited: "Creditado",
  refused: "Não creditado",
};

/** What the supplier is asked for on the claim's ticket. */
export const RETURN_EVIDENCE_PROMPT = "Envie fotos do produto que voltou";

export const REFUSAL_REASON_MIN = 5;
export const REFUSAL_REASON_MAX = 300;

/** The subject of the claim's ticket, as the supplier and the team read it. */
export function returnClaimSubject(externalOrderId: string): string {
  return `Devolução do pedido ${externalOrderId}`;
}

export interface ReturnClaimOutcome {
  status: ReturnClaimStatus;
  creditedCents: Cents | null;
  refusalReason: string | null;
}

/** One line for the reseller: where the supplier's credit for a returned order stands. */
export function supplierCreditText(outcome: ReturnClaimOutcome): string {
  if (outcome.status === "credited") {
    return `Crédito do fornecedor: ${formatCents(outcome.creditedCents ?? 0)} creditado`;
  }
  if (outcome.status === "refused") {
    const reason = outcome.refusalReason ?? "";
    return reason === "" ? "Crédito do fornecedor: não creditado" : `Não creditado: ${reason}`;
  }
  return "Crédito do fornecedor: em análise";
}

/** The few words under a returned order's amount in the statement. */
export function supplierCreditShortText(outcome: ReturnClaimOutcome): string {
  if (outcome.status === "credited") {
    return `${formatCents(outcome.creditedCents ?? 0)} creditado`;
  }
  if (outcome.status === "refused") {
    return "sem crédito do fornecedor";
  }
  return "crédito em análise";
}

/**
 * The amount the team credits: at least one cent and never more than the supplier's cost of
 * the returned items, which is what the reseller paid for them.
 */
export function assertCreditWithinCost(amountCents: Cents, supplierCostCents: Cents): Cents {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw validationError(`Informe um valor maior que zero (recebido: ${amountCents} centavos)`);
  }
  if (amountCents > supplierCostCents) {
    throw validationError(
      `O crédito não pode passar do custo do fornecedor, ${formatCents(supplierCostCents)} (recebido: ${formatCents(amountCents)})`,
    );
  }
  return amountCents;
}

/** A claim is decided once: a second click (or a second agent) must not change the money. */
export function assertClaimUndecided(status: ReturnClaimStatus): void {
  if (status !== "in_review") {
    throw conflictError(
      `Esta devolução já foi decidida (situação: ${RETURN_CLAIM_STATUS_LABELS[status]})`,
    );
  }
}

/** The team's decision on a claim, as the ticket screen sends it. */
export const decideReturnClaimSchema = z.discriminatedUnion("decision", [
  z.object({
    claimId: z.uuid(),
    decision: z.literal("credit"),
    amountCents: z.number().int().positive("Informe um valor maior que zero"),
  }),
  z.object({
    claimId: z.uuid(),
    decision: z.literal("refuse"),
    reason: freeText()
      .trim()
      .min(REFUSAL_REASON_MIN, "Conte em poucas palavras por que não haverá crédito")
      .max(REFUSAL_REASON_MAX, `Use até ${REFUSAL_REASON_MAX} caracteres`),
  }),
]);
export type ReturnClaimDecision = z.infer<typeof decideReturnClaimSchema>;
