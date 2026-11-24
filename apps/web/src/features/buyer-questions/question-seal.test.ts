import { describe, expect, it } from "vitest";
import { questionSeal, waitingSeal } from "./question-seal";

const now = new Date("2026-11-21T15:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

describe("waitingSeal", () => {
  it("shows a question asked within the hour as new, in green", () => {
    const seal = waitingSeal(minutesAgo(59), now);

    expect(seal.tone).toBe("success");
    expect(seal.label).toBe("Nova · há 59 minutos");
  });

  it("shows a question past the hour as waiting, in yellow", () => {
    const seal = waitingSeal(minutesAgo(60), now);

    expect(seal.tone).toBe("warning");
    expect(seal.label.startsWith("Esperando · ")).toBe(true);
  });

  it("shows a question past a day as late, in red", () => {
    const seal = waitingSeal(minutesAgo(24 * 60), now);

    expect(seal.tone).toBe("danger");
    expect(seal.label.startsWith("Atrasada · ")).toBe(true);
  });
});

describe("questionSeal", () => {
  it("names each settled state in words", () => {
    const base = { askedAt: minutesAgo(10), answeredAt: null };

    expect(questionSeal({ ...base, status: "under_review" }, now).label).toBe(
      "Em análise no Mercado Livre",
    );
    expect(questionSeal({ ...base, status: "closed" }, now).label).toBe(
      "Anúncio encerrado sem resposta",
    );
    expect(questionSeal({ ...base, status: "removed" }, now).label).toBe(
      "Apagada no Mercado Livre",
    );
  });

  it("dates an answered question", () => {
    const seal = questionSeal(
      { status: "answered", askedAt: minutesAgo(90), answeredAt: minutesAgo(30) },
      now,
    );

    expect(seal).toMatchObject({ tone: "success", label: "Respondida hoje às 11:30" });
  });
});
