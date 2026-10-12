import { formatCep, normalizeCep } from "@sellbridge/shared/cep";
import { optionalParameter } from "@sellbridge/shared/schemas";
import { z } from "zod";

/**
 * `?cep=` typed on the landing page. The router reads "?cep=30130010" as a number, so both
 * forms are accepted (zero-padded). The value comes out formatted ("30130-010"): a plain digit
 * string would be re-serialized with quotes and trigger a redirect to `?cep=%2230130010%22`.
 * An invalid CEP is dropped silently, like the other search parameters.
 */
export const cepSearchParameter = optionalParameter(
  z.union([z.string(), z.number()]).transform((input, context) => {
    const value = typeof input === "number" ? String(input).padStart(8, "0") : input;
    const cep = normalizeCep(value);
    if (cep === null) {
      context.addIssue({ code: "custom", message: "CEP inválido" });
      return z.NEVER;
    }
    return formatCep(cep);
  }),
);
