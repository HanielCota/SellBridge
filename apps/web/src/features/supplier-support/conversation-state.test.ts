import { describe, expect, it } from "vitest";
import { canWrite, conversationState } from "./conversation-state";

describe("conversationState", () => {
  it("tells each side who the conversation waits for", () => {
    expect(conversationState("reseller", "open").headline).toBe("Aguardando o fornecedor");
    expect(conversationState("supplier", "open").headline).toBe("Aguardando sua resposta");
  });

  it("warns about the auto-close once the supplier answered", () => {
    expect(conversationState("reseller", "answered").detail).toMatch(/7 dias/);
    expect(conversationState("supplier", "answered").detail).toMatch(/7 dias/);
  });
});

describe("canWrite", () => {
  it("lets the store reopen a resolved conversation but not the supplier", () => {
    expect(canWrite("reseller", "closed")).toBe(true);
    expect(canWrite("supplier", "closed")).toBe(false);
    expect(canWrite("supplier", "open")).toBe(true);
  });
});
