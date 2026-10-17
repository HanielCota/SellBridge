import { describe, expect, it } from "vitest";
import { profileRedirectFor } from "./profile-routes.ts";

describe("profileRedirectFor", () => {
  it("sends a supplier profile from seller pages to the supplier panel", () => {
    expect(profileRedirectFor("supplier", "/dashboard")).toBe("/fornecedor/painel");
    expect(profileRedirectFor("supplier", "/onboarding")).toBe("/fornecedor/painel");
    expect(profileRedirectFor("supplier", "/lojas")).toBe("/fornecedor/painel");
  });

  it("keeps a supplier profile on its panel and on account pages", () => {
    expect(profileRedirectFor("supplier", "/fornecedor/painel")).toBeNull();
    expect(profileRedirectFor("supplier", "/fornecedor/painel/produtos")).toBeNull();
    expect(profileRedirectFor("supplier", "/perfil")).toBeNull();
    expect(profileRedirectFor("supplier", "/suporte/novo")).toBeNull();
  });

  it("sends a seller profile from the supplier panel to its overview", () => {
    expect(profileRedirectFor("seller", "/fornecedor/painel/pedidos")).toBe("/dashboard");
  });

  it("keeps a seller profile on seller pages", () => {
    expect(profileRedirectFor("seller", "/dashboard")).toBeNull();
    expect(profileRedirectFor("seller", "/fornecedores")).toBeNull();
  });
});
