import { z } from "zod";
import { freeText } from "../schemas/common.ts";
import { stripAccents } from "./text.ts";

/**
 * Whether resellers may see a supplier. A supplier who signs up alone starts `pending`; the
 * automatic check (CNPJ active at the Receita and, when the admin asks for it, an approved
 * receiving account) or the team moves it on. Team-created and older suppliers are `approved`.
 */
export const SUPPLIER_APPROVAL_STATUSES = ["pending", "approved", "refused"] as const;
export type SupplierApprovalStatus = (typeof SUPPLIER_APPROVAL_STATUSES)[number];

/** What the public CNPJ query answered. */
export const CNPJ_LOOKUP_OUTCOMES = [
  "active",
  "inactive",
  "not_found",
  "unsupported",
  "unavailable",
] as const;
export type CnpjLookupOutcome = (typeof CNPJ_LOOKUP_OUTCOMES)[number];

export type CnpjLookupResult =
  | {
      readonly outcome: "active" | "inactive";
      readonly legalName: string;
      /** The Receita's word for the registration, such as "ATIVA" or "BAIXADA". */
      readonly registrationStatus: string;
    }
  | { readonly outcome: "not_found" | "unsupported" | "unavailable" };

/** The last answer kept for a supplier's CNPJ. */
export interface CnpjCheck {
  readonly cnpj: string;
  readonly outcome: CnpjLookupOutcome;
  readonly legalName: string | null;
  readonly registrationStatus: string | null;
  readonly checkedAt: Date;
  /** When the query first failed in a row; null once it answered. */
  readonly unavailableSince: Date | null;
}

/** How long a query that is down keeps being retried before the team takes the supplier. */
export const CNPJ_LOOKUP_RETRY_WINDOW_IN_MS = 60 * 60 * 1000;

export const APPROVAL_MISSING_ITEMS = ["company_data", "receiving_account"] as const;
export type ApprovalMissingItem = (typeof APPROVAL_MISSING_ITEMS)[number];

export const APPROVAL_TEAM_REASONS = [
  "cnpj_inactive",
  "cnpj_not_found",
  "cnpj_unsupported",
  "legal_name_mismatch",
  "lookup_unavailable",
] as const;
export type ApprovalTeamReason = (typeof APPROVAL_TEAM_REASONS)[number];

/** Where a pending supplier stands, as stored after each check. */
export const APPROVAL_STAGES = ["waiting_supplier", "checking", "needs_team"] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export interface ApprovalCompany {
  readonly cnpj: string;
  readonly legalName: string;
}

export interface ApprovalFacts {
  /** CNPJ and legal name from "Dados fiscais da empresa"; null until filled. */
  readonly company: ApprovalCompany | null;
  readonly check: CnpjCheck | null;
  readonly receivingAccountApproved: boolean;
  /** The admin switch "Exigir conta de recebimento para aprovar". */
  readonly requireReceivingAccount: boolean;
  readonly now: Date;
}

export type ApprovalVerdict =
  | { readonly kind: "approve" }
  /** The CNPJ needs a query: never asked, changed since, or the last query was down. */
  | { readonly kind: "lookup" }
  | { readonly kind: "wait_supplier"; readonly missing: readonly ApprovalMissingItem[] }
  | { readonly kind: "needs_team"; readonly reason: ApprovalTeamReason };

/** Words that only say the company type: the Receita and the supplier write them differently. */
const COMPANY_TYPE_WORDS = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "S", "A", "MEI", "SLU"]);

function legalNameWords(name: string): string[] {
  return (
    stripAccents(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .split(" ")
      // An MEI's legal name at the Receita ends with the owner's CPF digits.
      .filter((word) => word !== "" && !COMPANY_TYPE_WORDS.has(word) && !/^\d+$/.test(word))
  );
}

/**
 * Same company name, ignoring accents, case, punctuation, the company type ("LTDA", "ME") and
 * the CPF an MEI carries at the Receita.
 */
export function legalNamesMatch(typed: string, receita: string): boolean {
  const typedWords = legalNameWords(typed).join(" ");
  const receitaWords = legalNameWords(receita).join(" ");
  if (typedWords === "" || receitaWords === "") {
    return false;
  }
  return typedWords === receitaWords;
}

function missingItems(facts: ApprovalFacts): ApprovalMissingItem[] {
  const missing: ApprovalMissingItem[] = [];
  if (facts.company === null) {
    missing.push("company_data");
  }
  if (facts.requireReceivingAccount && !facts.receivingAccountApproved) {
    missing.push("receiving_account");
  }
  return missing;
}

function retryWindowOver(check: CnpjCheck, now: Date): boolean {
  const since = check.unavailableSince ?? check.checkedAt;
  return now.getTime() - since.getTime() >= CNPJ_LOOKUP_RETRY_WINDOW_IN_MS;
}

const FAILED_LOOKUP_REASONS: Partial<Record<CnpjLookupOutcome, ApprovalTeamReason>> = {
  inactive: "cnpj_inactive",
  not_found: "cnpj_not_found",
  unsupported: "cnpj_unsupported",
};

/**
 * What the automatic check does with a pending supplier. A failure the supplier cannot fix by
 * filling something in goes to the team; the query being down is retried for an hour first.
 */
export function decideSupplierApproval(facts: ApprovalFacts): ApprovalVerdict {
  const { company, check } = facts;
  if (company === null) {
    return { kind: "wait_supplier", missing: missingItems(facts) };
  }
  if (check === null || check.cnpj !== company.cnpj) {
    return { kind: "lookup" };
  }
  if (check.outcome === "unavailable") {
    return retryWindowOver(check, facts.now)
      ? { kind: "needs_team", reason: "lookup_unavailable" }
      : { kind: "lookup" };
  }
  const failed = FAILED_LOOKUP_REASONS[check.outcome];
  if (failed !== undefined) {
    return { kind: "needs_team", reason: failed };
  }
  if (check.legalName === null || !legalNamesMatch(company.legalName, check.legalName)) {
    return { kind: "needs_team", reason: "legal_name_mismatch" };
  }
  const missing = missingItems(facts);
  if (missing.length > 0) {
    return { kind: "wait_supplier", missing };
  }
  return { kind: "approve" };
}

/** The answer kept after a query, carrying when the query started failing. */
export function nextCnpjCheck(
  cnpj: string,
  result: CnpjLookupResult,
  previous: CnpjCheck | null,
  now: Date,
): CnpjCheck {
  if (result.outcome === "unavailable") {
    const stillFailing =
      previous !== null && previous.cnpj === cnpj && previous.outcome === "unavailable";
    return {
      cnpj,
      outcome: "unavailable",
      legalName: null,
      registrationStatus: null,
      checkedAt: now,
      unavailableSince: stillFailing ? (previous.unavailableSince ?? previous.checkedAt) : now,
    };
  }
  const answered = result.outcome === "active" || result.outcome === "inactive";
  return {
    cnpj,
    outcome: result.outcome,
    legalName: answered ? result.legalName : null,
    registrationStatus: answered ? result.registrationStatus : null,
    checkedAt: now,
    unavailableSince: null,
  };
}

/** What the team reads for each reason, with what to check. */
export const APPROVAL_TEAM_REASON_LABELS: Record<ApprovalTeamReason, string> = {
  cnpj_inactive: "CNPJ não está ativo na Receita",
  cnpj_not_found: "CNPJ não encontrado na Receita",
  cnpj_unsupported: "A consulta pública não reconhece este CNPJ",
  legal_name_mismatch: "Razão social diferente da Receita",
  lookup_unavailable: "Não deu para consultar a Receita",
};

/** The same reasons as the supplier reads them on its panel. */
export const APPROVAL_TEAM_REASON_SUPPLIER_TEXT: Record<ApprovalTeamReason, string> = {
  cnpj_inactive: "CNPJ inativo na Receita",
  cnpj_not_found: "CNPJ não encontrado na Receita",
  cnpj_unsupported: "Não conseguimos conferir este CNPJ na consulta pública",
  legal_name_mismatch: "A razão social não é a mesma da Receita",
  lookup_unavailable: "A consulta da Receita está fora do ar",
};

export const APPROVAL_MISSING_LABELS: Record<ApprovalMissingItem, string> = {
  company_data: "Falta informar o CNPJ e a razão social em Dados fiscais da empresa",
  receiving_account: "Falta ligar a conta de recebimento",
};

export const SUPPLIER_REFUSAL_REASON_MAX_LENGTH = 500;

export const supplierApprovalDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ supplierId: z.uuid(), decision: z.literal("approve") }),
  z.object({
    supplierId: z.uuid(),
    decision: z.literal("refuse"),
    reason: freeText()
      .trim()
      .min(10, "Escreva o motivo com pelo menos 10 letras: o fornecedor vai ler")
      .max(
        SUPPLIER_REFUSAL_REASON_MAX_LENGTH,
        `Use até ${SUPPLIER_REFUSAL_REASON_MAX_LENGTH} caracteres`,
      ),
  }),
]);
export type SupplierApprovalDecision = z.infer<typeof supplierApprovalDecisionSchema>;
