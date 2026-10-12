import { adminSaveProductSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { productFormInput, productFormValues } from "./form-values";

function parseAttributes(mercadoLivreAttributes: string) {
  const values = { ...productFormValues(), sku: "SKU-1", title: "Produto", mercadoLivreAttributes };
  return adminSaveProductSchema.safeParse(
    productFormInput(values, "11111111-1111-4111-8111-111111111111", undefined),
  );
}

describe("Mercado Livre attributes in the product form", () => {
  it("parses attribute codes and values, preserving equals signs inside values", () => {
    const result = parseAttributes(" BRAND = Acme \n MODEL = A=1 \n\n GTIN=7891234567890 ");
    expect(result.success).toBe(true);
    expect(result.data?.mercadoLivreAttributes).toEqual({
      BRAND: "Acme",
      MODEL: "A=1",
      GTIN: "7891234567890",
    });
  });

  it.each(["BRAND Acme", "BRAND=Acme\nBRAND=Other", "BRAND=", "brand=Acme"])(
    "rejects malformed or duplicate attributes: %s",
    (text) => {
      expect(parseAttributes(text).success).toBe(false);
    },
  );

  it("allows products with no Mercado Livre attributes", () => {
    expect(parseAttributes("").data?.mercadoLivreAttributes).toEqual({});
  });
});
