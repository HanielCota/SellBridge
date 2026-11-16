import { describe, expect, it } from "vitest";
import { splitOrderText } from "./split-order-notice";

describe("split order text", () => {
  it("says each supplier ships with its own freight on a Mercado Livre order", () => {
    expect(splitOrderText(2, "mercado_livre")).toBe(
      "Este pedido tem produtos de 2 fornecedores, e cada um envia a sua parte. A etiqueta do Mercado Livre vale para um pacote só, então cada fornecedor envia com o próprio frete e informa o rastreio.",
    );
  });

  it("only says who ships on a channel without a marketplace label", () => {
    expect(splitOrderText(3, "shopee")).toBe(
      "Este pedido tem produtos de 3 fornecedores, e cada um envia a sua parte.",
    );
  });
});
