import { describe, expect, it } from "vitest";
import { containsPattern, foldAccents } from "./search-pattern.ts";

describe("foldAccents", () => {
  it("drops accents and lowercases, uppercase letters included", () => {
    expect(foldAccents("Calça Verde")).toBe("calca verde");
    expect(foldAccents("PIÑATA")).toBe("pinata");
    expect(foldAccents("Ångström")).toBe("angstrom");
  });

  it("keeps plain symbols that SKUs may contain", () => {
    expect(foldAccents("AB^12`X")).toBe("ab^12`x");
    expect(foldAccents("~cabo¨")).toBe("~cabo¨");
  });
});

describe("containsPattern", () => {
  it("drops the NUL character Postgres refuses in text", () => {
    expect(containsPattern(`a${String.fromCharCode(0)}b`)).toBe("%ab%");
  });

  it("wraps the text and escapes the LIKE wildcards", () => {
    expect(containsPattern("100%_off\\")).toBe("%100\\%\\_off\\\\%");
  });
});
