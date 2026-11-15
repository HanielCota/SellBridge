import { describe, expect, it } from "vitest";
import { noStoresHelp } from "./bulk-publish-stores";

const FROM_A = { supplierId: "a" };
const FROM_B = { supplierId: "b" };

describe("no store for the batch", () => {
  it("asks to put both suppliers in one store when the batch mixes suppliers", () => {
    const help = noStoresHelp([FROM_A, FROM_B], true);

    expect(help.message).toContain("Nenhuma loja vende todos estes fornecedores");
    expect(help.action).toBe("Ir para Lojas");
  });

  it("asks to add the supplier to a store the account already has", () => {
    const help = noStoresHelp([FROM_A, FROM_A], true);

    expect(help.message).toBe(
      "Nenhuma loja vende este fornecedor. Adicione-o a uma das suas lojas antes de publicar.",
    );
    expect(help.action).toBe("Escolher a loja");
  });

  it("asks to connect a store when the account has none", () => {
    const help = noStoresHelp([FROM_A], false);

    expect(help.action).toBe("Conectar loja");
  });
});
