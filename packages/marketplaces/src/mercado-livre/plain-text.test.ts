import { describe, expect, it } from "vitest";
import { toMercadoLivrePlainText } from "./plain-text.ts";

describe("toMercadoLivrePlainText", () => {
  it("removes emojis, including the ones built from several characters", () => {
    const description = "🔥 Promoção 🔥\nCor: azul 💙\nKit 👍🏽 família 👨‍👩‍👧 Brasil 🇧🇷 item 1️⃣ ✅";

    const plainText = toMercadoLivrePlainText(description);

    expect(plainText).toBe("Promoção\nCor: azul\nKit família Brasil item 1");
  });

  it("joins the words an emoji stood between with one space", () => {
    expect(toMercadoLivrePlainText("Oferta🔥imperdível")).toBe("Oferta imperdível");
  });

  it("keeps accents, line breaks, punctuation and hashtags", () => {
    const description =
      "Camiseta de algodão, ótima à noite!\n\n- Tamanho: M (até 1,70 m)\n- Preço: R$ 49,90 #verão\n  Marca® Algodão™ © 2026";

    expect(toMercadoLivrePlainText(description)).toBe(description);
  });

  it("turns line-break tags into line breaks and drops other HTML tags", () => {
    const description = "<p>Tecido <b>macio</b></p><p>Lavar à mão<br/>Não usar alvejante</p>";

    expect(toMercadoLivrePlainText(description)).toBe(
      "Tecido macio\nLavar à mão\nNão usar alvejante",
    );
  });

  it("keeps a less-than sign that is not a tag", () => {
    expect(toMercadoLivrePlainText("Peso < 2 kg e altura > 10 cm")).toBe(
      "Peso < 2 kg e altura > 10 cm",
    );
  });

  it("writes Windows line breaks as the \\n the marketplace asks for", () => {
    expect(toMercadoLivrePlainText("Linha um\r\nLinha dois")).toBe("Linha um\nLinha dois");
  });

  it("returns an empty text when the description was only emojis and tags", () => {
    expect(toMercadoLivrePlainText("🔥🔥🔥\n<br>\n✨ ✨")).toBe("");
  });
});
