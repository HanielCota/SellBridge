import { describe, expect, it } from "vitest";
import { firstErrorMessage } from "./form-field";

describe("firstErrorMessage", () => {
  it("returns null when there are no errors", () => {
    expect(firstErrorMessage([])).toBeNull();
  });

  it("returns null for undefined or null entries", () => {
    expect(firstErrorMessage([undefined])).toBeNull();
    expect(firstErrorMessage([null])).toBeNull();
  });

  it("reads string errors", () => {
    expect(firstErrorMessage(["Campo obrigatório"])).toBe("Campo obrigatório");
  });

  it("reads Standard Schema issues", () => {
    expect(firstErrorMessage([{ message: "E-mail inválido", path: ["email"] }])).toBe(
      "E-mail inválido",
    );
  });

  it("falls back for unknown shapes", () => {
    expect(firstErrorMessage([{ code: 1 }])).toBe("Valor inválido");
  });
});
