import { describe, expect, it } from "vitest";
import { freeText, stripControlCharacters } from "./common.ts";
import { replyTicketSchema } from "./support.ts";

describe("free text", () => {
  it("drops control characters but keeps tabs and line breaks", () => {
    expect(stripControlCharacters("a\u0000b\u0007c\u007Fd\te\nf\r\n")).toBe("abcd\te\nf\r\n");
  });

  it("cleans a pasted NUL out of a ticket reply before it reaches the database", () => {
    const parsed = replyTicketSchema.parse({ body: "O pedido\u0000 chegou aberto, veja a foto." });
    expect(parsed.body).toBe("O pedido chegou aberto, veja a foto.");
  });

  it("stores an accent typed as two characters the same as the composed one", () => {
    expect(freeText().parse("CAFÉ")).toBe("CAFÉ");
  });
});
