import { describe, expect, it } from "vitest";
import { saleNoteXmlRefusal } from "./sale-note-xml";

describe("saleNoteXmlRefusal", () => {
  it("lets the XML go to a Mercado Livre order", () => {
    expect(saleNoteXmlRefusal("mercado_livre")).toBeNull();
  });

  it("asks for the typed key on any other marketplace", () => {
    expect(saleNoteXmlRefusal("tiktok_shop")).toBe(
      "O XML da nota só vai para pedidos do Mercado Livre. Neste pedido, cole a chave de acesso da nota.",
    );
  });
});
