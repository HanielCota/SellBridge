import { describe, expect, it } from "vitest";
import { marketplaceAddressNote } from "./marketplace-address-note";

describe("marketplaceAddressNote", () => {
  it("names the marketplace with its own article", () => {
    expect(marketplaceAddressNote("shopee")).toBe(
      "Endereço preenchido pelo pedido da Shopee. Confira antes de encaminhar.",
    );
    expect(marketplaceAddressNote("mercado_livre")).toBe(
      "Endereço preenchido pelo pedido do Mercado Livre. Confira antes de encaminhar.",
    );
  });
});
