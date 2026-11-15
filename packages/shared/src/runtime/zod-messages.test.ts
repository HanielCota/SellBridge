import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { installPortugueseZodMessages } from "./zod-messages.ts";

afterAll(() => {
  z.config(z.locales.en());
});

// Regression: with no locale set, a field without its own message showed Zod's English text.
describe("Zod fallback messages", () => {
  it("speaks Portuguese once installed", () => {
    installPortugueseZodMessages();
    const result = z.string().min(1).safeParse("");
    expect(result.error?.issues[0]?.message).toBe(
      "Pequeno demais: esperava que o texto tivesse >= 1 caracteres",
    );
  });

  it('says a mistyped link points to nothing, never "UUID"', () => {
    installPortugueseZodMessages();

    const result = z.object({ orderId: z.uuid() }).safeParse({ orderId: "abc" });

    expect(result.error?.issues[0]?.message).toBe(
      "Não encontramos este item. Confira o link ou volte pelo menu",
    );
  });

  it("keeps a field's own message for an invalid identifier", () => {
    installPortugueseZodMessages();

    const result = z.uuid("Escolha o produto de novo").safeParse("abc");

    expect(result.error?.issues[0]?.message).toBe("Escolha o produto de novo");
  });
});
