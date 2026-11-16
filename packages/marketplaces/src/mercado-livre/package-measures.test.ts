import { describe, expect, it } from "vitest";
import { isPackageAttribute, packageAttributeValue } from "./package-measures.ts";

describe("packageAttributeValue", () => {
  it.each([
    ["SELLER_PACKAGE_WEIGHT", "500", "500 g"],
    ["SELLER_PACKAGE_WEIGHT", "850 g", "850 g"],
    ["SELLER_PACKAGE_WEIGHT", "850G", "850 g"],
    ["SELLER_PACKAGE_HEIGHT", " 12 ", "12 cm"],
    ["SELLER_PACKAGE_WIDTH", "32.5 cm", "33 cm"],
    ["SELLER_PACKAGE_LENGTH", "30,2", "31 cm"],
    ["SELLER_PACKAGE_LENGTH", "0,4", "1 cm"],
  ])("sends %s stored as %j as %j", (id, stored, sent) => {
    const value = packageAttributeValue(id, stored);

    expect(value).toBe(sent);
  });

  it.each([
    ["SELLER_PACKAGE_WEIGHT", "0"],
    ["SELLER_PACKAGE_WEIGHT", ""],
    ["SELLER_PACKAGE_WEIGHT", "0,5 kg"],
    ["SELLER_PACKAGE_HEIGHT", "120 mm"],
    ["SELLER_PACKAGE_HEIGHT", "12 g"],
    ["SELLER_PACKAGE_WIDTH", "-3"],
    ["SELLER_PACKAGE_WIDTH", "12x20"],
  ])("leaves out %s stored as %j", (id, stored) => {
    const value = packageAttributeValue(id, stored);

    expect(value).toBeNull();
  });

  it("throws for an attribute that is not a package measure", () => {
    expect(() => packageAttributeValue("BRAND", "Genérica")).toThrow("Not a package attribute");
  });
});

describe("isPackageAttribute", () => {
  it("tells the four package attributes from the others", () => {
    const ids = ["SELLER_PACKAGE_WEIGHT", "SELLER_PACKAGE_LENGTH", "BRAND", "PACKAGE_WEIGHT"];

    const packageIds = ids.filter(isPackageAttribute);

    expect(packageIds).toEqual(["SELLER_PACKAGE_WEIGHT", "SELLER_PACKAGE_LENGTH"]);
  });
});
