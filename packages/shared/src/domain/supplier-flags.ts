import { z } from "zod";
import { freeText } from "../schemas/common.ts";
import { DAY_MILLISECONDS } from "./time.ts";

/**
 * Manual supplier flags (MVP function 6), like YouTube strikes: the team applies one with a
 * reason, it counts for 90 days and the supplier sees it in the panel and may contest it through
 * a support ticket. Three strikes and out: the flag that would be the 3rd active one deactivates
 * the supplier, but only once the team member who applies it confirms; nothing runs on its own.
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
/** Active flags at which the supplier is out (deactivated), on the applier's confirmation. */
export const SUPPLIER_FLAG_LIMIT = 3;
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
  return `${activeCount} de ${SUPPLIER_FLAG_LIMIT} em ${SUPPLIER_FLAG_VALIDITY_DAYS} dias`;
}

/** What the supplier reads under the counter. */
export const SUPPLIER_FLAG_LIMIT_WARNING = `Na ${SUPPLIER_FLAG_LIMIT}ª flag a conta é desligada.`;

export function reachedFlagLimit(activeCount: number): boolean {
  return activeCount >= SUPPLIER_FLAG_LIMIT;
}

/**
 * Whether one more flag puts an active supplier out: it would be the 3rd active one (or more, when
 * the team reactivated a supplier that still had 3). An inactive supplier has nothing to lose.
 */
export function flagDeactivatesSupplier(supplier: {
  activeFlagCount: number;
  supplierActive: boolean;
}): boolean {
  return supplier.supplierActive && reachedFlagLimit(supplier.activeFlagCount + 1);
}

/**
 * What the team reads before the flag that puts the supplier out. A supplier reactivated with 3
 * active flags would otherwise read "flag 4 de 3".
 */
export function deactivatingFlagNotice(activeFlagCount: number): string {
  const next = activeFlagCount + 1;
  if (next <= SUPPLIER_FLAG_LIMIT) {
    return `Esta é a flag ${next} de ${SUPPLIER_FLAG_LIMIT}: o fornecedor será desligado`;
  }
  return `O fornecedor foi reativado com ${activeFlagCount} flags ativas: esta flag o desliga de novo`;
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

/** Spaces of every kind and the zero-width characters, which `trim` keeps. */
const INVISIBLE_CHARACTERS = /[\s\u180E\u200B-\u200D\u2060\uFEFF]/g;

/**
 * A note with nothing visible is no note: "other" with only a zero-width space pasted in must be
 * refused like an empty one. Emoji joined by U+200D still have visible text and stay as typed.
 */
function emptyWhenInvisible(value: string): string {
  return value.replace(INVISIBLE_CHARACTERS, "") === "" ? "" : value;
}

function flagNote() {
  return freeText()
    .trim()
    .overwrite(emptyWhenInvisible)
    .refine((value) => characterCount(value) <= SUPPLIER_FLAG_NOTE_MAX_LENGTH, NOTE_TOO_LONG);
}

const supplierIdSchema = z.uuid({ error: "Fornecedor inválido" });

export const supplierFlagsInputSchema = z.object({ supplierId: supplierIdSchema });

export const applySupplierFlagSchema = z
  .object({
    supplierId: supplierIdSchema,
    reason: z.enum(SUPPLIER_FLAG_REASONS, { error: "Escolha o motivo" }),
    note: flagNote(),
    /** Ticked by the team member when this flag deactivates the supplier (3rd active one). */
    confirmDeactivation: z.boolean().default(false),
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
