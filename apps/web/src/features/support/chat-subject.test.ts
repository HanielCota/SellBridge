import { describe, expect, it } from "vitest";
import { chatSubjectFrom } from "./chat-subject";

describe("chatSubjectFrom", () => {
  it("uses the first line of the message as the subject", () => {
    expect(chatSubjectFrom("  Pedido sem rastreio\nO pedido 123 não mostra o código.")).toBe(
      "Pedido sem rastreio",
    );
  });

  it("collapses repeated spaces", () => {
    expect(chatSubjectFrom("Não   consigo\tpublicar")).toBe("Não consigo publicar");
  });

  it("falls back to a generic subject when the first line is too short", () => {
    expect(chatSubjectFrom("Oi\nPreciso de ajuda com o repasse")).toBe("Conversa pelo chat");
  });

  it("cuts a long first line to 120 characters with an ellipsis", () => {
    const subject = chatSubjectFrom("a".repeat(300));
    expect(subject).toHaveLength(120);
    expect(subject.endsWith("…")).toBe(true);
  });
});
