import { describe, expect, it } from "vitest";
import { adminProductValuesSchema } from "../schemas/admin-suppliers.ts";
import { parseProductCsv } from "./product-csv.ts";
import { catalogDraftValuesSchema } from "./supplier-panel-catalog-schemas.ts";
import { insecureImageErrors, isSupplierImageUrl } from "./supplier-panel-image-urls.ts";

const draft = {
  sku: "FOTO-1",
  title: "Caneca",
  description: "",
  costCents: 1000,
  suggestedPriceCents: 1990,
  stock: 1,
  categoryId: null,
  mercadoLivreAttributes: {},
};

describe("supplier photo links", () => {
  it("accepts only https photos from the supplier's form", () => {
    const secure = catalogDraftValuesSchema.safeParse({
      ...draft,
      imageUrls: ["https://exemplo.com/caneca.jpg"],
    });
    expect(secure.success).toBe(true);
    const plain = catalogDraftValuesSchema.safeParse({
      ...draft,
      imageUrls: ["http://exemplo.com/caneca.jpg"],
    });
    expect(plain.success).toBe(false);
    expect(plain.error?.issues[0]?.message).toBe(
      'Link de imagem inválido (recebido: "http://exemplo.com/caneca.jpg"); esperado: um link que comece com https://',
    );
  });

  it("keeps http photos allowed for staff", () => {
    const staff = adminProductValuesSchema.safeParse({
      ...draft,
      imageUrls: ["http://exemplo.com/caneca.jpg"],
    });
    expect(staff.success).toBe(true);
  });

  it("allows the app's own uploads on a development address", () => {
    expect(isSupplierImageUrl("http://localhost:4880/api/produtos/imagens/a.png")).toBe(true);
    expect(isSupplierImageUrl("http://127.0.0.1:3990/api/produtos/imagens/a.png")).toBe(true);
    expect(isSupplierImageUrl("ftp://exemplo.com/a.png")).toBe(false);
    expect(isSupplierImageUrl("exemplo.com/a.png")).toBe(false);
  });

  it("flags spreadsheet rows with any photo without https", () => {
    const parsed = parseProductCsv(
      [
        "sku;titulo;custo;estoque;imagens",
        "A;Pão;1;1;https://exemplo.com/a.jpg",
        "B;Feijão;1;1;https://exemplo.com/b.jpg|http://exemplo.com/c.jpg",
        "C;Arroz;1;1;",
      ].join("\n"),
    );
    expect(insecureImageErrors(parsed.rows)).toEqual([
      { line: 3, reason: "Imagens: valor inválido" },
    ]);
  });
});
