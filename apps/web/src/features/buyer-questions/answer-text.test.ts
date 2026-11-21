import { describe, expect, it } from "vitest";
import { answerLengthLabel, answerProblem } from "./answer-text";

describe("answerProblem", () => {
  it("asks for an answer when only spaces were typed", () => {
    expect(answerProblem("   ")).toBe("Escreva a resposta antes de enviar.");
  });

  it("says how many characters to delete past 2,000", () => {
    expect(answerProblem("a".repeat(2_003))).toBe(
      "A resposta pode ter até 2.000 caracteres. Apague 3 para enviar.",
    );
  });

  it("accepts an answer of exactly 2,000 characters", () => {
    expect(answerProblem("a".repeat(2_000))).toBeNull();
  });
});

describe("answerLengthLabel", () => {
  it("counts the typed characters against the limit", () => {
    expect(answerLengthLabel("Serve sim")).toBe("9 de 2.000 caracteres.");
  });
});
