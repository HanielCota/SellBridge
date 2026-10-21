import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, it } from "vitest";
import { resubmissionChecks, type ResubmittedProduct } from "./resubmission";

const product: ResubmittedProduct = {
  title: "Vaso de cerâmica artesanal 20 cm",
  description: "",
  sku: "ATF-VASO-001",
  costCents: 3500,
  suggestedPriceCents: 7990,
  stock: 40,
  imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  categoryName: "Casa e decoração",
  mercadoLivreAttributes: { GTIN: "7891234567895", SELLER_PACKAGE_WEIGHT: "900" },
  rejectionReasons: [],
  completeness: { blocking: [], improvements: [] },
};

describe("resubmissionChecks", () => {
  it("shows what the field holds now for each reason of the last rejection", () => {
    const checks = resubmissionChecks({
      ...product,
      rejectionReasons: [
        { field: "attributes.GTIN", rule: "gtin_recommended", message: "Informe o GTIN" },
        { field: "imageUrls", rule: "image_quality", message: "Troque a capa" },
        { field: "costCents", rule: "price_inconsistent", message: "Revise o custo" },
      ],
    });
    expect(checks.map((check) => [check.title, check.fieldLabel, check.currentValue])).toEqual([
      ["Código de barras ausente", "Código de barras (GTIN)", "7891234567895"],
      ["Imagem fora do padrão", "Imagens", "2 imagens"],
      ["Preço incoerente", "Custo", formatCents(3500)],
    ]);
  });

  it("flags a reason whose completeness item is still open", () => {
    const [check] = resubmissionChecks({
      ...product,
      mercadoLivreAttributes: {},
      rejectionReasons: [
        { field: "attributes.GTIN", rule: "gtin_recommended", message: "Informe o GTIN" },
      ],
      completeness: {
        blocking: [],
        improvements: [{ field: "attributes.GTIN", rule: "gtin_recommended" }],
      },
    });
    expect(check).toMatchObject({ currentValue: null, stillFlagged: true });
  });

  it("adds the unit to a package measure", () => {
    const [check] = resubmissionChecks({
      ...product,
      rejectionReasons: [
        {
          field: "attributes.SELLER_PACKAGE_WEIGHT",
          rule: "package_recommended",
          message: "Informe o peso",
        },
      ],
    });
    expect(check).toMatchObject({ currentValue: "900 g", stillFlagged: false });
  });
});
