import type {
  SupportAssistant,
  SupportAssistantQuestion,
  SupportAssistantResult,
} from "@sellbridge/shared/support-assistant";
import { describe, expect, it } from "vitest";
import { createSupportAssistant, withFallback } from "./support-assistant-chain";

const PLAN_QUESTION: SupportAssistantQuestion = {
  profile: "seller",
  topic: "account",
  subtopic: "plan",
  text: "Quero mudar para o plano anual.",
};

function fixedAssistant(result: SupportAssistantResult): SupportAssistant {
  return { provider: "deepseek", answer: async () => result };
}

describe("support assistant chain", () => {
  it("answers from the local FAQ by default", async () => {
    const result = await createSupportAssistant("faq").answer(PLAN_QUESTION);
    expect(result).toMatchObject({ kind: "answer", answer: { id: "seller-plan" } });
  });

  it("falls back to the FAQ while the deepseek provider is not configured", async () => {
    const assistant = createSupportAssistant("deepseek");
    expect(assistant.provider).toBe("deepseek");
    expect(await assistant.answer(PLAN_QUESTION)).toMatchObject({
      kind: "answer",
      answer: { id: "seller-plan" },
    });
  });

  it("keeps the primary's own decision to send the question to a person", async () => {
    const fallback = fixedAssistant({
      kind: "answer",
      answer: { id: "x", title: "x", steps: ["x"], links: [] },
    });
    const primary = fixedAssistant({ kind: "needs_human", reason: "always_human" });
    expect(await withFallback(primary, fallback).answer(PLAN_QUESTION)).toEqual({
      kind: "needs_human",
      reason: "always_human",
    });
  });

  it("asks the fallback when the primary failed", async () => {
    const primary = fixedAssistant({ kind: "needs_human", reason: "failed" });
    const fallback = fixedAssistant({ kind: "needs_human", reason: "no_match" });
    expect(await withFallback(primary, fallback).answer(PLAN_QUESTION)).toEqual({
      kind: "needs_human",
      reason: "no_match",
    });
  });
});
