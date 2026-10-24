import { replySupplierConversationSchema } from "@sellbridge/shared/schemas";
import { describe, expect, it } from "vitest";
import { conversationContactRefusals } from "./conversation-contact";

function refusalsFor(body: string) {
  const parsed = replySupplierConversationSchema.safeParse({ body });
  if (parsed.success) {
    return [];
  }
  return conversationContactRefusals(parsed.error, { body });
}

describe("conversationContactRefusals", () => {
  it("names the field and the kind of contact, never the text", () => {
    const refusals = refusalsFor("Me chama no zap 11 98765-4321 que eu resolvo rapidinho");
    expect(refusals).toEqual([{ field: "body", kinds: ["phone"] }]);
    expect(JSON.stringify(refusals)).not.toContain("98765");
  });

  it("finds e-mails and chat links as well", () => {
    const email = refusalsFor("Mande o comprovante para vendas@marca.com.br por favor");
    expect(email.at(0)?.kinds).toContain("email");
    expect(refusalsFor("Fala comigo por aqui: https://wa.me/5511987654321 obrigado")).not.toEqual(
      [],
    );
  });

  it("is empty when the message was refused for something else", () => {
    expect(refusalsFor("Curto")).toEqual([]);
  });
});
