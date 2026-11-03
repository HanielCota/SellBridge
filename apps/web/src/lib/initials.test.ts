import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initials("Ana Maria Souza")).toBe("AS");
  });

  it("skips a last word in parentheses", () => {
    expect(initials("Ateliê Divinópolis (fornecedor)")).toBe("AD");
  });

  it("skips words that start with a symbol", () => {
    expect(initials("- Bruno")).toBe("B");
  });

  it("falls back to a question mark without letters", () => {
    expect(initials("  ")).toBe("?");
  });
});
