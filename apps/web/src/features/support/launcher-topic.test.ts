import { describe, expect, it } from "vitest";
import { isLauncherHidden, launcherTopic } from "./launcher-topic";

describe("launcherTopic", () => {
  it("opens the money topic from the pages about money", () => {
    expect(launcherTopic("/financeiro")).toBe("payment");
    expect(launcherTopic("/assinatura")).toBe("payment");
  });

  it("starts at step 1 anywhere else, without matching look-alike paths", () => {
    expect(launcherTopic("/dashboard")).toBeUndefined();
    expect(launcherTopic("/pedidos")).toBeUndefined();
    expect(launcherTopic("/financeiro-antigo")).toBeUndefined();
  });
});

describe("isLauncherHidden", () => {
  it("keeps the bubble on store and supplier conversations under /suporte", () => {
    expect(isLauncherHidden("/suporte/revendedores")).toBe(false);
    expect(isLauncherHidden("/suporte/revendedores/relatorio")).toBe(false);
    expect(isLauncherHidden("/suporte/fornecedores/novo")).toBe(false);
    expect(isLauncherHidden("/suporte/conversas/abc")).toBe(false);
  });

  it("hides the bubble on the team ticket pages and the new-listing page", () => {
    expect(isLauncherHidden("/suporte")).toBe(true);
    expect(isLauncherHidden("/suporte/novo")).toBe(true);
    expect(isLauncherHidden("/suporte/0b6b4f7e-0000-4000-8000-000000000000")).toBe(true);
    expect(isLauncherHidden("/publicacoes/nova")).toBe(true);
  });

  it("shows the bubble on every other page", () => {
    expect(isLauncherHidden("/dashboard")).toBe(false);
    expect(isLauncherHidden("/suporte-antigo")).toBe(false);
  });
});
