import { describe, expect, it } from "vitest";
import { redactContactDetails } from "./contact-details.ts";

describe("redactContactDetails", () => {
  it("removes e-mails", () => {
    const comment = "Me chama no fulano.silva@gmail.com ou fulano@loja.com.br";
    expect(redactContactDetails(comment)).toBe("Me chama no [removido] ou [removido]");
  });

  it("removes links and bare domains", () => {
    const links = "Compre em www.minhaloja.com.br/promo ou https://loja.shop/x";
    expect(redactContactDetails(links)).toBe("Compre em [removido] ou [removido]");
    const domains = "Visite minhaloja.com.br ou loja.shop/produto hoje";
    expect(redactContactDetails(domains)).toBe("Visite [removido] ou [removido] hoje");
  });

  it("removes @handles", () => {
    const comment = "Siga @minha.loja no Instagram";
    expect(redactContactDetails(comment)).toBe("Siga [removido] no Instagram");
  });

  it("removes Brazilian phone numbers in the usual formats", () => {
    const comment = "Zap (11) 98765-4321, +55 11 98765 4321, 98765-4321, 11987654321 ou 3333-4444";
    expect(redactContactDetails(comment)).toBe(
      "Zap [removido], [removido], [removido], [removido] ou [removido]",
    );
  });

  it("removes CPF and CNPJ, formatted or not", () => {
    const comment = "CPF 123.456.789-09, CNPJ 12.345.678/0001-90 e 12345678000190";
    expect(redactContactDetails(comment)).toBe("CPF [removido], CNPJ [removido] e [removido]");
  });

  it("keeps the review itself: dates, prices, scores and a missing space", () => {
    const comment = "Chegou em 12/09, custou R$ 1.299,90 em 2x. Nota 10/10, ótima.Com certeza";
    expect(redactContactDetails(comment)).toBe(comment);
  });

  it("keeps order numbers and tracking codes, which say which sale the review is about", () => {
    const comment =
      "Pedido 2000012345678901 (MLB1234567890) chegou com o rastreio AA123456789BR, venda #SIM-9F936BC5";
    expect(redactContactDetails(comment)).toBe(comment);
  });

  it("sees through full-width and mathematical digits, a full-width @ and wide gaps", () => {
    const fullWidth = String.fromCodePoint(
      ..."11987654321".split("").map((digit) => 0xff10 + Number(digit)),
    );
    const mathematical = String.fromCodePoint(
      ..."11987654321".split("").map((digit) => 0x1d7ce + Number(digit)),
    );
    const wideAt = String.fromCodePoint(0xff20);
    expect(redactContactDetails(`Me chama no ${fullWidth}`)).toBe("Me chama no [removido]");
    expect(redactContactDetails(`Ou no ${mathematical}`)).toBe("Ou no [removido]");
    expect(redactContactDetails(`joao${wideAt}gmail.com`)).toBe("[removido]");
    expect(redactContactDetails("Liga 11   98765   4321")).toBe("Liga [removido]");
  });
});
