import { describe, expect, it } from "vitest";
import { freeText, MAX_SEARCH_LENGTH, searchQuery, stripControlCharacters } from "./common.ts";
import { replyTicketSchema } from "./support.ts";

describe("free text", () => {
  it("drops control characters but keeps tabs and line breaks", () => {
    expect(stripControlCharacters("a\u0000b\u0007c\u007Fd\te\nf\r\n")).toBe("abcd\te\nf\r\n");
  });

  it("cleans a pasted NUL out of a ticket reply before it reaches the database", () => {
    const parsed = replyTicketSchema.parse({ body: "O pedido\u0000 chegou aberto, veja a foto." });
    expect(parsed.body).toBe("O pedido chegou aberto, veja a foto.");
  });

  // Regression: a lone surrogate in an address reached the jsonb column and failed with a 500.
  it("replaces a lone surrogate half, and keeps emoji whole", () => {
    expect(freeText().parse("Jo\ud800")).toBe("Jo�");
    expect(freeText().parse("\udc00x")).toBe("�x");
    expect(freeText().parse("Rua 😀 10")).toBe("Rua 😀 10");
  });

  it("stores an accent typed as two characters the same as the composed one", () => {
    expect(freeText().parse("CAFÉ")).toBe("CAFÉ");
  });
});

describe("searchQuery", () => {
  it("keeps a search of exactly the limit", () => {
    const text = "a".repeat(MAX_SEARCH_LENGTH);
    expect(searchQuery().parse(text)).toBe(text);
  });

  // Regression: a 101+ character search was refused, which dropped the filter and listed (and
  // exported) every order.
  it("cuts a longer search to the limit instead of dropping it", () => {
    expect(searchQuery().parse(`${"b".repeat(MAX_SEARCH_LENGTH)}c`)).toBe("b".repeat(100));
  });

  it("never cuts an emoji in half at the limit", () => {
    const text = `${"a".repeat(MAX_SEARCH_LENGTH - 1)}😀`;
    expect(searchQuery().parse(text)).toBe("a".repeat(MAX_SEARCH_LENGTH - 1));
  });
});
