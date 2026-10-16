import { validationError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import { errorMessage, UNEXPECTED_ERROR_MESSAGE } from "./errors";

describe("errorMessage", () => {
  it("shows the message of an error from a server function", () => {
    expect(errorMessage(new Error("Informe o número"))).toBe("Informe o número");
  });

  it("shows the message of an AppError", () => {
    expect(errorMessage(validationError("CEP inválido. Informe os 8 dígitos."))).toBe(
      "CEP inválido. Informe os 8 dígitos.",
    );
  });

  it("hides a browser bug or a dropped connection", () => {
    expect(
      errorMessage(new TypeError("Cannot read properties of undefined (reading 'replace')")),
    ).toBe(UNEXPECTED_ERROR_MESSAGE);
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(UNEXPECTED_ERROR_MESSAGE);
  });

  it("falls back when there is nothing to show", () => {
    expect(errorMessage(new Error("  "))).toBe(UNEXPECTED_ERROR_MESSAGE);
    expect(errorMessage(undefined)).toBe(UNEXPECTED_ERROR_MESSAGE);
  });

  it("shows a thrown string", () => {
    expect(errorMessage("Sessão expirada")).toBe("Sessão expirada");
  });
});
