import { describe, expect, it } from "vitest";
import { CONVERSATION_CONTACT_REFUSED } from "./contact-guard.ts";
import {
  createSupplierConversationSchema,
  replySupplierConversationSchema,
} from "./supplier-conversations.ts";

const STORE = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

function replyIssue(body: string): string | undefined {
  const parsed = replySupplierConversationSchema.safeParse({ body });
  return parsed.success ? undefined : parsed.error.issues.at(0)?.message;
}

describe("conversation messages", () => {
  it.each([
    ["a phone", "Me liga no 11 98765-4321 que a gente resolve"],
    ["an e-mail", "Manda a nota para compras@loja.com.br, por favor"],
    ["a WhatsApp link", "Chama no https://wa.me/5511987654321 que é mais rápido"],
    ["an Instagram handle", "Me segue no instagram.com/lojacentro para combinar"],
  ])("refuses %s in either direction", (_kind, body) => {
    expect(replyIssue(body)).toBe(CONVERSATION_CONTACT_REFUSED);
  });

  it("accepts a plain message about the order", () => {
    expect(replyIssue("O pedido 2000123 chegou com a caixa amassada.")).toBeUndefined();
  });

  it("refuses a contact in the first message of a new conversation", () => {
    const parsed = createSupplierConversationSchema.safeParse({
      storeConnectionId: STORE,
      topic: "order",
      situation: "order-late",
      body: "Me chama no zap 11 98765-4321 para combinar",
      orderId: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("reads an empty order and situation as none picked", () => {
    const parsed = createSupplierConversationSchema.parse({
      storeConnectionId: STORE,
      topic: "product",
      situation: "",
      body: "A forma do tênis de corrida é pequena ou normal?",
      orderId: "",
    });
    expect(parsed).toMatchObject({ situation: undefined, orderId: undefined });
  });
});
