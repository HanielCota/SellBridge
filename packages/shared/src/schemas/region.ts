import { z } from "zod";
import { freeText } from "./common.ts";
import { cepSchema } from "../domain/cep.ts";

/** Written on the address in place of a house number when the user ticks "Sem número". */
export const NO_HOUSE_NUMBER = "S/N";

function requiredText(message: string, max: number) {
  return freeText().trim().min(1, message).max(max, `Use até ${max} caracteres`);
}

/** Only the CEP: what the region preview needs to resolve the city before anything is saved. */
export const cepLookupSchema = z.object({ cep: cepSchema });
export type CepLookupInput = z.input<typeof cepLookupSchema>;

/**
 * The tenant's full address. City and state are not here on purpose: they always come from the
 * CEP, because they decide which suppliers deliver and must match the supplier coverage.
 */
export const updateRegionSchema = z.object({
  cep: cepSchema,
  street: requiredText("Informe a rua", 200),
  number: requiredText("Informe o número", 20),
  complement: freeText()
    .trim()
    .max(100, "Use até 100 caracteres")
    .transform((value) => (value.length > 0 ? value : null))
    .nullish(),
  neighborhood: requiredText("Informe o bairro", 120),
});
export type UpdateRegionInput = z.input<typeof updateRegionSchema>;
