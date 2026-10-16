import { describe, expect, it } from "vitest";
import { attentionSummary } from "./customer-summary";

describe("attentionSummary", () => {
  it("counts the customers and those needing attention", () => {
    expect(attentionSummary({ customerCount: 1, needingAttention: 0, rankingLimit: null })).toBe(
      "1 cliente, todos em dia.",
    );
    expect(attentionSummary({ customerCount: 12, needingAttention: 2, rankingLimit: null })).toBe(
      "12 clientes · 2 precisam de atenção agora.",
    );
  });

  // Regression: past 5,000 accounts the list was cut to the newest ones without a word.
  it("says when the ranking only holds the newest accounts", () => {
    expect(attentionSummary({ customerCount: 5000, needingAttention: 0, rankingLimit: 5000 })).toBe(
      "5000 clientes, todos em dia. Mostrando só as 5.000 contas mais recentes; busque pelo nome ou e-mail para achar as outras.",
    );
  });
});
