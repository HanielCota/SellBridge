import { describe, expect, it } from "vitest";
import { cepLookupMessage } from "./use-cep-autofill";

describe("cepLookupMessage", () => {
  it("asks to check and complete the number once the address is found", () => {
    const found = {
      kind: "found",
      address: {
        street: "Rua A",
        neighborhood: "Centro",
        city: "Divinópolis",
        state: "MG",
        ibgeCode: "3122306",
      },
    } as const;

    expect(cepLookupMessage(found)).toBe(
      "Endereço encontrado pelo CEP. Confira e complete o número.",
    );
  });

  it("says how to go on when the CEP is not found or the service is out", () => {
    expect(cepLookupMessage({ kind: "not_found" })).toContain("Confira os números");
    expect(cepLookupMessage({ kind: "unavailable" })).toContain("Preencha o endereço");
    expect(cepLookupMessage(null)).toBeNull();
  });
});
