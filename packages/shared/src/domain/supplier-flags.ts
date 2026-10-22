import { z } from "zod";
import { freeText } from "../schemas/common.ts";
import { DAY_MILLISECONDS } from "./time.ts";

/**
 * Manual supplier flags (MVP function 6), like YouTube strikes: the team applies one with a
 * reason, it counts for 90 days and the supplier sees it in the panel and may contest it through
 * a support ticket. Nothing happens on its own when flags pile up: at 3 the supplier is only
 * highlighted for the team.
 */
export const SUPPLIER_FLAG_REASONS = [
  "product_listing_error",
  "stale_catalog",
  "slow_support",
  "order_error",
  "contact_attempt",
  "other",
] as const;
export type SupplierFlagReason = (typeof SUPPLIER_FLAG_REASONS)[number];

export const SUPPLIER_FLAG_REASON_LABELS: Readonly<Record<SupplierFlagReason, string>> = {
  product_listing_error: "Erro no cadastro de produto",
  stale_catalog: "Catálogo ou estoque desatualizado",
  slow_support: "Atraso para responder",
  order_error: "Erro em pedido",
  contact_attempt: "Tentou passar contato fora da plataforma",
  other: "Outro",
};

/** What each reason means, in the supplier's words, with one example. */
export const SUPPLIER_FLAG_REASON_EXPLANATIONS: Readonly<Record<SupplierFlagReason, string>> = {
  product_listing_error:
    "Um produto foi cadastrado com dados errados. Exemplo: foto de outro produto ou preço trocado.",
  stale_catalog:
    "O catálogo ou o estoque não estava em dia. Exemplo: produto sem estoque que continuou à venda.",
  slow_support: "A equipe esperou muito por uma resposta sua. Exemplo: um chamado sem resposta.",
  order_error: "Um pedido saiu errado. Exemplo: tamanho ou cor diferente do que foi vendido.",
  contact_attempt:
    "Houve uma tentativa de falar com o comprador por fora da plataforma. Exemplo: passar telefone.",
  other: "A equipe explica o motivo na observação abaixo.",
};

export const SUPPLIER_FLAG_VALIDITY_DAYS = 90;
/** Active flags at which the team is asked to look at the supplier; nothing is automatic. */
export const SUPPLIER_FLAG_ATTENTION_THRESHOLD = 3;
export const SUPPLIER_FLAG_NOTE_MAX_LENGTH = 500;

export type SupplierFlagStatus = "active" | "expired" | "revoked";

export function supplierFlagExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SUPPLIER_FLAG_VALIDITY_DAYS * DAY_MILLISECONDS);
}

/** Active while not revoked and before `expiresAt`: at exactly 90 days it no longer counts. */
export function supplierFlagStatus(
  flag: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): SupplierFlagStatus {
  if (flag.revokedAt !== null) {
    return "revoked";
  }
  if (now.getTime() >= flag.expiresAt.getTime()) {
    return "expired";
  }
  return "active";
}

/** "1 de 3 em 90 dias". */
export function supplierFlagCountLabel(activeCount: number): string {
  return `${activeCount} de ${SUPPLIER_FLAG_ATTENTION_THRESHOLD} em ${SUPPLIER_FLAG_VALIDITY_DAYS} dias`;
}

export function needsTeamAttention(activeCount: number): boolean {
  return activeCount >= SUPPLIER_FLAG_ATTENTION_THRESHOLD;
}

/** Most recent first; a tie keeps the order it came in. Returns a new array. */
export function newestFlagsFirst<Flag extends { createdAt: Date }>(flags: readonly Flag[]): Flag[] {
  return flags.toSorted((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
}

/** Counts characters as Postgres `char_length` does: an emoji is one, not two code units. */
function characterCount(value: string): number {
  return Array.from(value).length;
}

const NOTE_TOO_LONG = `Use até ${SUPPLIER_FLAG_NOTE_MAX_LENGTH} caracteres.`;

function flagNote() {
  return freeText()
    .trim()
    .refine((value) => characterCount(value) <= SUPPLIER_FLAG_NOTE_MAX_LENGTH, NOTE_TOO_LONG);
}

const supplierIdSchema = z.uuid({ error: "Fornecedor inválido" });

export const supplierFlagsInputSchema = z.object({ supplierId: supplierIdSchema });

export const applySupplierFlagSchema = z
  .object({
    supplierId: supplierIdSchema,
    reason: z.enum(SUPPLIER_FLAG_REASONS, { error: "Escolha o motivo" }),
    note: flagNote(),
  })
  .superRefine((value, context) => {
    if (value.reason === "other" && value.note === "") {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Com o motivo “Outro”, explique na observação o que aconteceu.",
      });
    }
  });
export type ApplySupplierFlagInput = z.infer<typeof applySupplierFlagSchema>;

export const revokeSupplierFlagSchema = z.object({
  supplierId: supplierIdSchema,
  flagId: z.uuid({ error: "Flag inválida" }),
  revokeNote: flagNote().pipe(
    z.string().min(1, "Conte por que a flag está sendo retirada. Exemplo: aplicada por engano."),
  ),
});
export type RevokeSupplierFlagInput = z.infer<typeof revokeSupplierFlagSchema>;
