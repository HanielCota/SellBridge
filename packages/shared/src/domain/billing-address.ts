import { z } from "zod";
import { freeText } from "../schemas/common.ts";
import { BRAZILIAN_STATES } from "./brazilian-states.ts";

const CEP_LENGTH = 8;
const STREET_MAX_LENGTH = 200;
const NUMBER_MAX_LENGTH = 20;
const COMPLEMENT_MAX_LENGTH = 120;
const PLACE_MAX_LENGTH = 100;
/** What the masked address shows in place of the hidden parts. */
const HIDDEN = "•••";
const NO_BREAK_SPACE = " ";

function digitsOf(input: string): string {
  return input.replace(/\D/g, "");
}

/** Stored as the 8 digits; the 00000-000 mask is presentation. */
export const cepSchema = z
  .string()
  .trim()
  .transform(digitsOf)
  .refine((value) => value.length === CEP_LENGTH, {
    message: "Informe os 8 números do CEP, como 01310-100",
  });

/** Masks while typing: 01310-100, from the digits that are there. */
export function formatCep(input: string): string {
  return digitsOf(input)
    .slice(0, CEP_LENGTH)
    .replace(/^(\d{5})(\d)/, "$1-$2");
}

function requiredText(message: string, maxLength: number) {
  return freeText().trim().min(1, message).max(maxLength, `Use até ${maxLength} caracteres`);
}

/**
 * Where invoices and charges go: the reseller's own address, unrelated to the supplier's
 * shipping. Kept field by field so a CEP lookup (ViaCEP) can fill street, district, city and
 * state later.
 */
export const billingAddressSchema = z.strictObject({
  cep: cepSchema,
  street: requiredText("Informe a rua", STREET_MAX_LENGTH),
  /** "s/n" for an address without a number. */
  number: requiredText("Informe o número ou s/n", NUMBER_MAX_LENGTH),
  complement: freeText()
    .trim()
    .max(COMPLEMENT_MAX_LENGTH, `Use até ${COMPLEMENT_MAX_LENGTH} caracteres`),
  neighborhood: requiredText("Informe o bairro", PLACE_MAX_LENGTH),
  city: requiredText("Informe a cidade", PLACE_MAX_LENGTH),
  /** Typed as any text so a form can hold "" before a state is picked. */
  state: z.string().pipe(z.enum(BRAZILIAN_STATES, { error: "Escolha o estado" })),
});
export type BillingAddress = z.output<typeof billingAddressSchema>;
export type BillingAddressInput = z.input<typeof billingAddressSchema>;

/** The full address in two lines, as the owner or the team reads it after revealing it. */
export function formatBillingAddress(address: BillingAddress): readonly [string, string] {
  const complement = address.complement === "" ? "" : `, ${address.complement}`;
  return [
    `${address.street}, ${address.number}${complement}`,
    // A no-break space keeps "CEP" and its number on the same line on narrow screens.
    `${address.neighborhood} · ${address.city}/${address.state} · CEP${NO_BREAK_SPACE}${formatCep(address.cep)}`,
  ];
}

/**
 * The address with street, number, district and CEP hidden: enough to recognize it on a screen
 * that may be seen by others, not enough to find the house.
 */
export function maskBillingAddress(address: BillingAddress): string {
  return `${HIDDEN}, ${HIDDEN} · ${address.city}/${address.state}`;
}
