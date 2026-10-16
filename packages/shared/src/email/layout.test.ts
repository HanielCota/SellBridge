import { describe, expect, it } from "vitest";
import { escapeHtml, renderActionEmail } from "./layout.ts";

const content = {
  subject: "Confirme seu e-mail no SellBridge",
  preview: "Falta só confirmar o seu e-mail.",
  heading: "Confirme o seu e-mail",
  paragraphs: ["Falta só um passo."],
  actionLabel: "Confirmar e-mail",
  actionUrl: "https://app.sellbridge.com.br/api/auth/verify-email?token=abc&callbackURL=%2Flogin",
  footnote: "Se você não criou uma conta, ignore.",
};

describe("renderActionEmail", () => {
  it("links the button and the fallback to the action URL, escaped", () => {
    const email = renderActionEmail(content, "https://app.sellbridge.com.br");
    const escapedUrl = "token=abc&amp;callbackURL=%2Flogin";
    expect(email.html.match(new RegExp(escapedUrl, "g"))).toHaveLength(3);
    expect(email.html).toContain(
      'src="https://app.sellbridge.com.br/brand/sellbridge-email-logo.png"',
    );
  });

  it("escapes text so user data cannot inject markup", () => {
    const email = renderActionEmail(
      { ...content, heading: '<script>alert("x")</script>' },
      "https://app.sellbridge.com.br",
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("keeps a plain-text version with the raw link", () => {
    const email = renderActionEmail(content, "https://app.sellbridge.com.br");
    expect(email.subject).toBe(content.subject);
    expect(email.text).toContain(`Confirmar e-mail: ${content.actionUrl}`);
    expect(email.text).not.toContain("<");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
