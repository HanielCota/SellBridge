import { describe, expect, it } from "vitest";
import { describeIssue, healthHeadline } from "./issue-copy";

describe("describeIssue", () => {
  it("names the one store to reconnect", () => {
    const copy = describeIssue({
      kind: "store",
      stores: [
        {
          marketplace: "shopee",
          shopName: "Loja Ana (loja simulada)",
          status: "expired",
          supplierName: null,
        },
      ],
    });
    expect(copy.title).toBe("Reconectar Loja Ana");
    expect(copy.description).toContain("expirou");
  });

  it("counts stores, listings and tickets in Portuguese plurals", () => {
    const store = { marketplace: "shopee", shopName: "A", status: "error", supplierName: null };
    expect(describeIssue({ kind: "store", stores: [store, store] }).badge).toBe(
      "2 lojas desconectadas",
    );
    expect(describeIssue({ kind: "listings", count: 1 }).title).toBe("1 publicação com erro");
    expect(describeIssue({ kind: "ticket", count: 3 }).badge).toBe("3 chamados");
  });

  it("says which first step is missing", () => {
    const copy = describeIssue({
      kind: "onboarding",
      nextStep: "store",
      completedSteps: 2,
      idleDays: 12,
    });
    expect(copy).toEqual({
      title: "Parado em 2 de 4 passos",
      description: "Falta: loja. Conta criada há 12 dias.",
      badge: "Primeiros passos 2/4",
    });
  });

  it("tells a sales drop from an inactive account", () => {
    expect(describeIssue({ kind: "cooling", reason: "decline", dropPercent: 60 }).badge).toBe(
      "Queda de 60%",
    );
    expect(describeIssue({ kind: "cooling", reason: "inactive", idleDays: 41 }).title).toBe(
      "Sem acessar há 41 dias",
    );
  });
});

describe("healthHeadline", () => {
  const base = { score: 76, level: "healthy" as const, completedSteps: 2, stage: "setup" as const };

  it("leads with the most urgent issue, then the next step", () => {
    expect(
      healthHeadline({ ...base, nextStep: "listing", issues: [{ kind: "ticket", count: 1 }] }),
    ).toBe("1 chamado aguardando resposta");
    expect(healthHeadline({ ...base, nextStep: "listing", issues: [] })).toBe(
      "Próximo passo: publicação",
    );
    expect(healthHeadline({ ...base, nextStep: null, issues: [] })).toBe("Tudo em dia");
  });
});
