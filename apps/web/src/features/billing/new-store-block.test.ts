import { describe, expect, it } from "vitest";
import { newStoreBlockCopy } from "./new-store-block";

describe("newStoreBlockCopy", () => {
  it("asks an account without a plan to choose one", () => {
    expect(newStoreBlockCopy({ kind: "choose_plan" })).toBe(
      "Para conectar uma loja, escolha um plano.",
    );
  });

  it("names the full plan and the way out", () => {
    expect(newStoreBlockCopy({ kind: "plan_full", planName: "Start" })).toBe(
      "Seu plano Start já está com todas as lojas. Para conectar outra, mude para um plano maior.",
    );
  });
});
