import { describe, expect, it } from "vitest";
import { attributeLabel, formatAttributeValue } from "./supplier-product-attributes.ts";

describe("attributeLabel", () => {
  it("names the known Mercado Livre attributes in Portuguese", () => {
    expect(attributeLabel("BRAND")).toBe("Marca");
    expect(attributeLabel("SELLER_PACKAGE_HEIGHT")).toBe("Altura da embalagem");
  });

  it("turns an unknown attribute code into readable words", () => {
    expect(attributeLabel("MAIN_COLOR")).toBe("Main color");
  });
});

describe("formatAttributeValue", () => {
  it("adds the unit to package weight and measures", () => {
    expect(formatAttributeValue("SELLER_PACKAGE_WEIGHT", "900")).toBe("900 g");
    expect(formatAttributeValue("SELLER_PACKAGE_LENGTH", "16")).toBe("16 cm");
  });

  it("keeps values without a unit, and a value that already has one, as typed", () => {
    expect(formatAttributeValue("BRAND", "Ateliê Teste")).toBe("Ateliê Teste");
    expect(formatAttributeValue("SELLER_PACKAGE_WEIGHT", "900 g")).toBe("900 g");
  });
});
