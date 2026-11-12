import { describe, expect, it } from "vitest";
import {
  emojiRefusalMessage,
  emojisRemovedNotice,
  hasEmoji,
  namedEmojis,
  removeEmojis,
} from "./emoji.ts";

describe("hasEmoji", () => {
  it("finds emojis, flags and keycaps", () => {
    expect(hasEmoji("Promoção 🔥")).toBe(true);
    expect(hasEmoji("Feito no Brasil 🇧🇷")).toBe(true);
    expect(hasEmoji("Passo 1️⃣")).toBe(true);
  });

  it("does not take accents, punctuation, hashtags or brand signs for emojis", () => {
    expect(hasEmoji("Camiseta de algodão, ótima! #verão 100% R$ 49,90 Marca® Algodão™ ©")).toBe(
      false,
    );
  });
});

describe("removeEmojis", () => {
  it("removes emojis, including the ones built from several characters", () => {
    const text = "🔥 Promoção 🔥\nCor: azul 💙\nKit 👍🏽 família 👨‍👩‍👧 Brasil 🇧🇷 item 1️⃣ ✅";

    expect(removeEmojis(text)).toBe("Promoção\nCor: azul\nKit família Brasil item 1");
  });

  it("joins the words an emoji stood between with one space", () => {
    expect(removeEmojis("Oferta🔥imperdível")).toBe("Oferta imperdível");
  });

  it("leaves a text without emojis exactly as it was", () => {
    const text = "  - Tamanho: M (até 1,70 m)\n\nLavar à mão #verão ";

    expect(removeEmojis(text)).toBe(text);
  });

  it("returns an empty text when there was nothing but emojis", () => {
    expect(removeEmojis("🔥🔥🔥\n✨ ✨")).toBe("");
  });
});

describe("namedEmojis", () => {
  it("names each emoji once, whole, up to three", () => {
    expect(namedEmojis("🔥 a 🔥 b 👍🏽 c 👨‍👩‍👧 d 🇧🇷 e ✅")).toBe("🔥 👍🏽 👨‍👩‍👧");
  });
});

describe("emojiRefusalMessage", () => {
  it("names the emojis found and says what to do", () => {
    expect(emojiRefusalMessage("Camiseta 🔥 ✅")).toBe(
      "A descrição tem emojis (🔥 ✅), e o Mercado Livre não aceita. Tire os emojis para salvar.",
    );
  });

  it("still explains when only an invisible emoji piece is left", () => {
    expect(emojiRefusalMessage("Marca️")).toBe(
      "A descrição tem emojis, e o Mercado Livre não aceita. Tire os emojis para salvar.",
    );
  });
});

describe("emojisRemovedNotice", () => {
  it("says nothing when no description had emojis", () => {
    expect(emojisRemovedNotice(0)).toBeNull();
  });

  it("counts one product and many products in Portuguese", () => {
    expect(emojisRemovedNotice(1)).toBe(
      "Tiramos os emojis da descrição de 1 produto: o Mercado Livre não aceita.",
    );
    expect(emojisRemovedNotice(1234)).toBe(
      "Tiramos os emojis da descrição de 1.234 produtos: o Mercado Livre não aceita.",
    );
  });
});
