import { z } from "zod";

/**
 * The reseller's own Bling issuing its sale note (note 1) of venda à ordem: the fiscal settings
 * its accountant may change, and how a Mercado Livre payment finds its "forma de pagamento" in
 * that Bling (NT 2025.001 asks a card sale for the card's brand and authorization code).
 */

/** Mercado Livre's CNPJ as the sale's intermediary, from its "Importar nota fiscal" guide. */
export const MERCADO_LIVRE_INTERMEDIARY_CNPJ = "03007331000141";

/**
 * Shopee's CNPJ as the sale's intermediary (SHPS Tecnologia e Serviços Ltda), as Brazilian
 * marketplace accountants list it; to be confirmed by the reseller's accountant on the first note.
 */
export const SHOPEE_INTERMEDIARY_CNPJ = "35635824000112";

/** CFOP of a sale of goods delivered by a third party on the seller's order (venda à ordem). */
export const RESELLER_SALE_CFOP_DEFAULTS = { inState: "5120", outOfState: "6120" } as const;

export const CARD_BRANDS = ["visa", "mastercard", "amex", "elo", "hipercard", "diners"] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

const CARD_BRAND_NAMES: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  diners: "Diners Club",
};

/** Bling's `dadosCartao.bandeira` codes (official OpenAPI, `FormasPagamentosDadosCartaoDTO`). */
const BLING_CARD_BRANDS: Readonly<Record<number, CardBrand>> = {
  1: "visa",
  2: "mastercard",
  3: "amex",
  5: "diners",
  6: "elo",
  7: "hipercard",
};

/** Bling's `tipoPagamento` codes that the slots below use. */
const BLING_PAYMENT_TYPES = {
  creditCard: 3,
  debitCard: 4,
  boleto: 15,
  dynamicPix: 17,
  wallet: 18,
  staticPix: 20,
} as const;

/** How the buyer paid on Mercado Livre, each mapped to one "forma de pagamento" of the Bling. */
export const PAYMENT_SLOTS = [
  "pix",
  "boleto",
  "wallet",
  "credit_visa",
  "credit_mastercard",
  "credit_amex",
  "credit_elo",
  "credit_hipercard",
  "credit_diners",
  "debit_visa",
  "debit_mastercard",
  "debit_amex",
  "debit_elo",
  "debit_hipercard",
  "debit_diners",
] as const satisfies readonly (
  "pix" | "boleto" | "wallet" | `credit_${CardBrand}` | `debit_${CardBrand}`
)[];
export type PaymentSlot = (typeof PAYMENT_SLOTS)[number];

/** The slot's name on the reseller's screen. */
export function paymentSlotLabel(slot: PaymentSlot): string {
  if (slot === "pix") {
    return "Pix";
  }
  if (slot === "boleto") {
    return "Boleto";
  }
  if (slot === "wallet") {
    return "Saldo do Mercado Pago";
  }
  for (const brand of CARD_BRANDS) {
    if (slot === `credit_${brand}`) {
      return `Cartão de crédito ${CARD_BRAND_NAMES[brand]}`;
    }
    if (slot === `debit_${brand}`) {
      return `Cartão de débito ${CARD_BRAND_NAMES[brand]}`;
    }
  }
  throw new Error(`Payment slot without a label: ${slot}`);
}

const cfopSchema = (example: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}$/, `Use um CFOP com 4 números, como ${example}`);

const paymentMethodIdSchema = z.number().int().positive().nullable();

export const resellerBlingSettingsSchema = z.object({
  /** The Bling "natureza de operação" of the sale; null until the reseller picks one. */
  operationId: z.number().int().positive().nullable(),
  cfopInState: cfopSchema(RESELLER_SALE_CFOP_DEFAULTS.inState),
  cfopOutOfState: cfopSchema(RESELLER_SALE_CFOP_DEFAULTS.outOfState),
  intermediaryCnpj: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().length(14, "O CNPJ do intermediador tem 14 números")),
  paymentMethods: z.partialRecord(z.enum(PAYMENT_SLOTS), paymentMethodIdSchema),
});

export type ResellerBlingSettings = z.infer<typeof resellerBlingSettingsSchema>;

/** The settings before the reseller changes anything. */
export function defaultResellerBlingSettings(): ResellerBlingSettings {
  return {
    operationId: null,
    cfopInState: RESELLER_SALE_CFOP_DEFAULTS.inState,
    cfopOutOfState: RESELLER_SALE_CFOP_DEFAULTS.outOfState,
    intermediaryCnpj: MERCADO_LIVRE_INTERMEDIARY_CNPJ,
    paymentMethods: {},
  };
}

/** The sale's CFOP: in-state when the reseller and the buyer are in the same state. */
export function resellerSaleCfop(
  settings: Pick<ResellerBlingSettings, "cfopInState" | "cfopOutOfState">,
  input: { resellerState: string; buyerState: string },
): string {
  const sameState =
    input.resellerState.trim().toUpperCase() === input.buyerState.trim().toUpperCase();
  return sameState ? settings.cfopInState : settings.cfopOutOfState;
}

/** A Mercado Livre payment as its order gives it (`payment_type`, `payment_method_id`). */
export interface MarketplacePayment {
  readonly type: string;
  readonly methodId: string;
}

const ML_CARD_BRANDS: Readonly<Record<string, CardBrand>> = {
  visa: "visa",
  debvisa: "visa",
  master: "mastercard",
  debmaster: "mastercard",
  amex: "amex",
  elo: "elo",
  debelo: "elo",
  hipercard: "hipercard",
  diners: "diners",
};

/** The slot of a Mercado Livre payment, or null when it is a kind SellBridge does not map. */
export function paymentSlotOf(payment: MarketplacePayment): PaymentSlot | null {
  const methodId = payment.methodId.trim().toLowerCase();
  if (methodId === "pix") {
    return "pix";
  }
  if (payment.type === "ticket") {
    return "boleto";
  }
  if (payment.type === "account_money") {
    return "wallet";
  }
  const brand = ML_CARD_BRANDS[methodId];
  if (brand === undefined) {
    return null;
  }
  if (payment.type === "credit_card") {
    return `credit_${brand}`;
  }
  if (payment.type === "debit_card") {
    return `debit_${brand}`;
  }
  return null;
}

/** Whether NT 2025.001 asks this slot for the card group (brand and authorization code). */
export function isCardSlot(slot: PaymentSlot): boolean {
  return slot.startsWith("credit_") || slot.startsWith("debit_");
}

/** A "forma de pagamento" of the reseller's Bling, with its card brand when it is a card. */
export interface BlingPaymentMethodSummary {
  readonly id: number;
  readonly name: string;
  readonly type: number;
  /** Bling's brand code; null for anything that is not a card or a card without a brand. */
  readonly cardBrand: number | null;
}

function slotOfBlingMethod(method: BlingPaymentMethodSummary): PaymentSlot | null {
  if (
    method.type === BLING_PAYMENT_TYPES.dynamicPix ||
    method.type === BLING_PAYMENT_TYPES.staticPix
  ) {
    return "pix";
  }
  if (method.type === BLING_PAYMENT_TYPES.boleto) {
    return "boleto";
  }
  if (method.type === BLING_PAYMENT_TYPES.wallet) {
    return "wallet";
  }
  const brand = method.cardBrand === null ? undefined : BLING_CARD_BRANDS[method.cardBrand];
  if (brand === undefined) {
    return null;
  }
  if (method.type === BLING_PAYMENT_TYPES.creditCard) {
    return `credit_${brand}`;
  }
  if (method.type === BLING_PAYMENT_TYPES.debitCard) {
    return `debit_${brand}`;
  }
  return null;
}

/**
 * The likely "forma de pagamento" of each slot, by Bling's payment type and card brand. The first
 * method of a slot wins; a slot no method fits stays out.
 */
export function guessPaymentMethods(
  methods: readonly BlingPaymentMethodSummary[],
): ResellerBlingSettings["paymentMethods"] {
  const guessed = new Map<PaymentSlot, number>();
  for (const method of methods) {
    const slot = slotOfBlingMethod(method);
    if (slot !== null && !guessed.has(slot)) {
      guessed.set(slot, method.id);
    }
  }
  return Object.fromEntries(guessed);
}

/** The Bling method of a payment, or why the note cannot go out, in the reseller's words. */
export function paymentMethodFor(
  settings: Pick<ResellerBlingSettings, "paymentMethods">,
  payment: MarketplacePayment,
): { methodId: number; slot: PaymentSlot; problem: null } | { problem: string } {
  const slot = paymentSlotOf(payment);
  if (slot === null) {
    return {
      problem:
        "O comprador pagou de um jeito que o SellBridge ainda não liga a uma forma de pagamento do Bling. Emita esta nota no seu sistema e envie o XML.",
    };
  }
  const methodId = settings.paymentMethods[slot] ?? null;
  if (methodId === null) {
    return {
      problem: `Falta a forma de pagamento "${paymentSlotLabel(slot)}". Crie no seu Bling, escolha em Integrações › Bling e toque em Tentar de novo no pedido.`,
    };
  }
  return { methodId, slot, problem: null };
}

/**
 * Splits the note's total among the order's payments in proportion to what each paid, the
 * rounding left on the last one: a Mercado Livre payment covers the whole order and its shipping,
 * while the note covers one parcel's goods.
 *
 * @param totalCents - The note's total in cents. Must be a non-negative integer.
 * @throws {RangeError} When the total is not a non-negative integer or a payment is negative.
 */
export function allocateInstallments(
  totalCents: number,
  payments: readonly { readonly amountCents: number }[],
): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError(`Note total must be a non-negative integer, got ${totalCents}`);
  }
  if (
    payments.some((payment) => !Number.isInteger(payment.amountCents) || payment.amountCents < 0)
  ) {
    throw new RangeError("Payment amounts must be non-negative integers");
  }
  const paid = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (payments.length === 0 || paid === 0) {
    return payments.map(() => 0);
  }
  const shares = payments.map((payment) => Math.floor((totalCents * payment.amountCents) / paid));
  const allocated = shares.reduce((sum, share) => sum + share, 0);
  const lastIndex = shares.length - 1;
  return shares.with(lastIndex, (shares[lastIndex] ?? 0) + totalCents - allocated);
}
