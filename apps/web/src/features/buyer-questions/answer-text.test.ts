import { describe, expect, it } from "vitest";
import { answerLengthLabel, answerProblem, answerTextSchema } from "./answer-text";

describe("answerProblem", () => {
  it("asks for an answer when only spaces were typed", () => {
    expect(answerProblem("   ")).toBe("Escreva a resposta antes de enviar.");
  });

  it("says how many characters to delete past 2,000", () => {
    expect(answerProblem("a".repeat(2_003))).toBe(
      "A resposta pode ter até 2.000 caracteres. Apague 3 para enviar.",
    );
  });

  it("refuses an answer with a phone, naming what to delete", () => {
    expect(answerProblem("Serve sim! Qualquer dúvida me chama no 11 98765-4321")).toBe(
      "A resposta tem telefone. O Mercado Livre não aceita contato fora dele: apague esse trecho para enviar.",
    );
  });

  it("names every kind of contact the answer carries", () => {
    const problem = answerProblem("Fale comigo: loja@exemplo.com.br ou 11 98765-4321");

    expect(problem).toContain("telefone");
    expect(problem).toContain("e-mail");
  });

  it("accepts an answer with years, sizes and deadlines", () => {
    expect(
      answerProblem(
        "Serve sim, do modelo 2015 em diante. Mede 30 x 40 cm, pesa 1,2 kg e enviamos em até 2 dias úteis.",
      ),
    ).toBeNull();
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

describe("answerTextSchema", () => {
  it("refuses on the server an answer that carries an e-mail", () => {
    const parsed = answerTextSchema.safeParse("Mande um e-mail para loja@exemplo.com.br");

    expect(parsed.success).toBe(false);
  });

  it("keeps the trimmed answer when it is clean", () => {
    expect(answerTextSchema.parse("  Serve sim.  ")).toBe("Serve sim.");
  });
});
