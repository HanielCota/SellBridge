import { describe, expect, it } from "vitest";
import { labelErrorPage } from "./label-error-page";

describe("labelErrorPage", () => {
  it("shows the reason as a themed page in Portuguese", () => {
    const page = labelErrorPage("A etiqueta ainda não está disponível");
    expect(page).toContain('<html lang="pt-BR">');
    expect(page).toContain('content="light dark"');
    expect(page).toContain("<p>A etiqueta ainda não está disponível</p>");
  });

  it("escapes the reason so it can never inject markup", () => {
    expect(labelErrorPage('<script>alert("x")</script>')).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});
