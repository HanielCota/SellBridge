import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { cepLookupQueryOptions, type CepAddress, type CepLookupResult } from "./cep-lookup";

const CEP_LENGTH = 8;

function digitsOf(cep: string): string {
  return cep.replace(/\D/g, "");
}

/**
 * Looks a CEP up as it is typed and hands the address to `apply` when it is found; a CEP typed
 * over while the lookup runs is ignored. Every field stays editable.
 */
export function useCepAutofill(apply: (address: CepAddress) => void) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<CepLookupResult | null>(null);
  const latest = useRef("");
  async function lookUp(cep: string): Promise<void> {
    const digits = digitsOf(cep);
    latest.current = digits;
    if (digits.length !== CEP_LENGTH) {
      setResult(null);
      return;
    }
    const found = await queryClient.fetchQuery(cepLookupQueryOptions(digits));
    if (latest.current !== digits) {
      return;
    }
    setResult(found);
    if (found.kind === "found") {
      apply(found.address);
    }
  }
  return { message: cepLookupMessage(result), lookUp };
}

/** What the form says under the CEP after a lookup, in the customer's words. */
export function cepLookupMessage(result: CepLookupResult | null): string | null {
  if (result === null) {
    return null;
  }
  if (result.kind === "found") {
    return "Endereço encontrado pelo CEP. Confira e complete o número.";
  }
  if (result.kind === "not_found") {
    return "Não achamos este CEP. Confira os números ou preencha o endereço.";
  }
  return "Não deu para buscar o CEP agora. Preencha o endereço.";
}
