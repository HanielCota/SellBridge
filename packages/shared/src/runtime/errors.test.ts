import { describe, expect, it } from "vitest";
import { userMessageOr, validationError } from "./errors.ts";

describe("userMessageOr", () => {
  it("keeps the message written for the user", () => {
    expect(userMessageOr(validationError("Preço inválido"), "Falhou")).toBe("Preço inválido");
  });

  it("never shows a driver or network message to the user", () => {
    expect(userMessageOr(new Error("fetch failed"), "Falhou")).toBe("Falhou");
    expect(userMessageOr("timeout", "Falhou")).toBe("Falhou");
  });
});
