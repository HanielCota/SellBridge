import { describe, expect, it } from "vitest";
import { findProhibitedProduct, prohibitedProductMessage } from "./prohibited-products.ts";

describe("findProhibitedProduct", () => {
  it("finds an encapsulated supplement however it is written", () => {
    const match = findProhibitedProduct("Colágeno em cápsulas 60 doses");
    expect(match).toEqual({
      groupId: "supplements",
      label: "Suplementos e encapsulados",
      term: "em capsulas",
    });
  });

  it("finds a medicine named in the description", () => {
    const match = findProhibitedProduct("Kit cuidados\nAcompanha remédio para dor de cabeça.");
    expect(match?.groupId).toBe("medicines");
  });

  it("finds tobacco, weapons, pesticides and live animals", () => {
    expect(findProhibitedProduct("Pod descartável 5000 puffs")?.groupId).toBe("tobacco");
    expect(findProhibitedProduct("Caixa de munição calibre 38")?.groupId).toBe("weapons");
    expect(findProhibitedProduct("Raticida granulado 100 g")?.groupId).toBe("pesticides");
    expect(findProhibitedProduct("Filhote vivo de calopsita")?.groupId).toBe("live_animals");
  });

  it("allows a product that only contains a prohibited term inside another word", () => {
    expect(findProhibitedProduct("Cápsulas de café espresso 10 unidades")).toBeNull();
    expect(findProhibitedProduct("Sérum facial vitamina C 30 ml")).toBeNull();
    expect(findProhibitedProduct("Camiseta estampa vaporwave")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(findProhibitedProduct("   ")).toBeNull();
  });
});

describe("prohibitedProductMessage", () => {
  it("names the class and the term found", () => {
    const match = findProhibitedProduct("Suplemento de creatina 300 g");
    expect(match).not.toBeNull();
    if (match === null) {
      return;
    }
    expect(prohibitedProductMessage(match)).toContain("suplementos e encapsulados");
    expect(prohibitedProductMessage(match)).toContain('"suplemento"');
  });
});
