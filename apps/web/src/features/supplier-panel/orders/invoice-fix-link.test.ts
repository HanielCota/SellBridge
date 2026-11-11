import { describe, expect, it } from "vitest";
import { invoiceFixLink } from "./invoice-fix-link";

describe("invoiceFixLink", () => {
  it("opens the products missing fiscal data when the note lacks a product's NCM", () => {
    const link = invoiceFixLink(
      "Falta o NCM do produto S01-020. Preencha em Produtos e peça para tentar de novo.",
    );

    expect(link).toEqual({
      label: "Abrir produtos sem dados fiscais",
      path: "/produtos?fiscal=missing",
    });
  });

  it("opens the Bling card when Bling has to be connected again", () => {
    const link = invoiceFixLink(
      "O Bling foi desconectado. Conecte o Bling de novo para continuar. Depois, peça para tentar de novo.",
    );

    expect(link.path).toBe("/importar");
  });

  it("opens the Bling card when issuing through Bling was switched off", () => {
    const link = invoiceFixLink(
      "A nota pelo Bling foi desligada antes desta nota sair. Emita direto no Bling, ou ligue de novo e peça para tentar de novo.",
    );

    expect(link.path).toBe("/importar");
  });

  it("opens Marca for a tax code Bling refused", () => {
    expect(invoiceFixLink("O Bling recusou a nota: CFOP 6108 inválido.").path).toBe("/marca");
  });

  it("opens Marca when there is no problem text", () => {
    expect(invoiceFixLink(null).path).toBe("/marca");
  });
});
