import { describe, expect, it } from "vitest";
import {
  REPLY_TEMPLATES,
  fillTemplate,
  firstName,
  insertAt,
  quoteMessage,
} from "./reply-templates";

const context = {
  customerName: "Ana",
  storeName: "Loja da Ana",
  subject: "Pedido atrasado",
  agentName: "Bruno",
};

describe("fillTemplate", () => {
  it("replaces every known placeholder", () => {
    expect(fillTemplate("{cliente} · {loja} · {assunto} · {atendente}", context)).toBe(
      "Ana · Loja da Ana · Pedido atrasado · Bruno",
    );
  });

  it("keeps unknown placeholders visible", () => {
    expect(fillTemplate("Olá {apelido}", context)).toBe("Olá {apelido}");
  });

  it("leaves no placeholder behind in the shipped templates", () => {
    for (const template of REPLY_TEMPLATES) {
      expect(fillTemplate(template.body, context)).not.toMatch(/\{\w+\}/);
    }
  });
});

describe("firstName", () => {
  it("keeps the first word of the name", () => {
    expect(firstName("  Ana Maria Souza ")).toBe("Ana");
    expect(firstName("Ana")).toBe("Ana");
  });
});

describe("insertAt", () => {
  it("replaces the selection and puts the caret after the insertion", () => {
    expect(insertAt("Olá mundo", "querido ", 4, 4)).toEqual({
      value: "Olá querido mundo",
      caret: 12,
    });
    expect(insertAt("abc", "X", 1, 2)).toEqual({ value: "aXc", caret: 2 });
  });
});

describe("quoteMessage", () => {
  it("prefixes every line and credits the author", () => {
    expect(quoteMessage("Ana", "linha 1\nlinha 2\n")).toBe(
      "> Ana escreveu:\n> linha 1\n> linha 2\n\n",
    );
  });
});
