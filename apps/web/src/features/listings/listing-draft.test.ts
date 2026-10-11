import { describe, expect, it } from "vitest";
import { resolveListingDraft } from "./listing-draft";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Garrafa térmica de aço inox com tampa rosqueável e alça dobrável 1 litro",
  description: "Mantém a bebida quente por 12 horas e gelada por 24 horas.",
  suggestedPriceCents: 8990,
};

describe("resolveListingDraft", () => {
  it("keeps every value the caller chose", () => {
    expect(
      resolveListingDraft(product, {
        title: "Garrafa térmica 1 litro",
        description: "Descrição escrita pelo revendedor.",
        priceCents: 9990,
      }),
    ).toEqual({
      supplierProductId: product.id,
      title: "Garrafa térmica 1 litro",
      description: "Descrição escrita pelo revendedor.",
      priceCents: 9990,
    });
  });

  it("fills the gaps from the product, cutting the title to the marketplace limit", () => {
    const draft = resolveListingDraft(product, {});
    expect(draft.title).toBe("Garrafa térmica de aço inox com tampa rosqueável e alça");
    expect(draft.title.length).toBeLessThanOrEqual(60);
    expect(draft.description).toBe(product.description);
    expect(draft.priceCents).toBe(8990);
  });

  it("rejects a product description too short to be a listing description", () => {
    expect(() => resolveListingDraft({ ...product, description: "" }, {})).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });

  it("rejects a product title too short to be a listing title", () => {
    expect(() => resolveListingDraft({ ...product, title: "Caneca" }, {})).toThrow(
      expect.objectContaining({ code: "VALIDATION" }),
    );
  });
});
