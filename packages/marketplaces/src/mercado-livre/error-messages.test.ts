import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, it } from "vitest";
import { explainMercadoLivreError } from "./error-messages.ts";
import { ERROR_FIXTURES } from "./fixtures/errors.ts";

describe("explainMercadoLivreError", () => {
  it("names the missing required attributes and what to do", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.missingRequiredAttributes, 400)).toBe(
      "Faltam atributos obrigatórios para esta categoria no Mercado Livre: BRAND, MODEL. " +
        "Preencha esses campos no cadastro do produto e publique de novo.",
    );
  });

  it("gives the category's minimum price in reais", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.categoryMinimumPrice, 400)).toBe(
      `O Mercado Livre pede preço mínimo de ${formatCents(800)} nesta categoria. ` +
        "Aumente o preço e publique de novo.",
    );
  });

  it("explains pictures under 500 pixels", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.smallPictures, 400)).toBe(
      "As fotos do produto são pequenas demais para o Mercado Livre (mínimo de 500 pixels em um dos lados). " +
        "Fale com o suporte para trocar as fotos e publique de novo.",
    );
  });

  it("asks for a more descriptive title", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.shortTitle, 400)).toBe(
      "O título é curto demais para o Mercado Livre. " +
        "Inclua mais características do produto no título e publique de novo.",
    );
  });

  it("explains the documentation's example by its one blocking error, skipping warnings", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.documentationExample, 400)).toBe(
      "Sua conta do Mercado Livre não está autorizada a vender esta marca nesta categoria. " +
        "Valide a marca no Mercado Livre (Vendas > Preferências de vendas > Validações) e publique de novo.",
    );
  });

  it("joins two blocking errors and leaves the warning out", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.twoErrors, 400)).toBe(
      "As fotos do produto são pequenas demais para o Mercado Livre (mínimo de 500 pixels em um dos lados). " +
        "Fale com o suporte para trocar as fotos e publique de novo. " +
        "Faltam atributos obrigatórios para esta categoria no Mercado Livre: GTIN. " +
        "Preencha esses campos no cadastro do produto e publique de novo.",
    );
  });

  it("keeps the marketplace's own words for a code it does not know", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.unknownCode, 400)).toBe(
      "O Mercado Livre recusou o anúncio: Something new went wrong with this item. " +
        "Revise o anúncio e tente de novo.",
    );
  });

  it("cuts a long unknown message so the card stays readable", () => {
    const long = {
      ...ERROR_FIXTURES.unknownCode,
      cause: [{ ...ERROR_FIXTURES.unknownCode.cause[0], message: "x".repeat(1_500) }],
    };
    const explained = explainMercadoLivreError(long, 400);
    expect(explained.length).toBeLessThan(400);
    expect(explained).toContain("…. Revise o anúncio e tente de novo.");
  });

  it("keeps today's message when the body has no cause", () => {
    expect(explainMercadoLivreError(ERROR_FIXTURES.withoutCause, 400)).toBe(
      "Mercado Livre recusou a operação: attribute BRAND is required",
    );
    expect(explainMercadoLivreError("not json", 502)).toBe("Mercado Livre respondeu com erro 502");
  });
});
