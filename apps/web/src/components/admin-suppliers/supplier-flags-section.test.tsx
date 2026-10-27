import type { TeamSupplierFlag } from "@sellbridge/database/repositories";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/features/admin-suppliers/supplier-flags.functions", () => ({
  teamListSupplierFlags: vi.fn<() => Promise<never>>(),
  teamApplySupplierFlag: vi.fn<() => Promise<never>>(),
  teamRevokeSupplierFlag: vi.fn<() => Promise<never>>(),
}));
const { SupplierFlagsPanel } = await import("./supplier-flags-section");

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const activeFlag: TeamSupplierFlag = {
  id: "1b6f3a8e-2c4d-4e5f-8a9b-0c1d2e3f4a5b",
  reason: "order_error",
  note: "Cor trocada no pedido 1234",
  createdAt: new Date("2026-10-12T15:00:00Z"),
  expiresAt: new Date("2027-01-10T15:00:00Z"),
  createdByName: "Ana",
  revokedAt: null,
  revokedByName: null,
  revokeNote: null,
  status: "active",
};

function render(
  canManage: boolean,
  flags: readonly TeamSupplierFlag[] = [activeFlag],
  supplierActive = true,
): string {
  const data = {
    flags,
    activeCount: flags.length,
    reachedLimit: flags.length >= 3,
    supplierActive,
    canManage,
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <SupplierFlagsPanel supplierId={supplierId} data={data} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("SupplierFlagsPanel", () => {
  it("shows an agent the flags without the apply and revoke buttons", () => {
    const markup = render(false);
    expect(markup).toContain("Erro em pedido");
    expect(markup).toContain("Cor trocada no pedido 1234");
    expect(markup).not.toContain("Aplicar flag");
    expect(markup).not.toContain("Retirar flag");
  });

  it("gives a supervisor or an admin the apply and revoke buttons", () => {
    const markup = render(true);
    expect(markup).toContain("Aplicar flag");
    expect(markup).toContain("Retirar flag");
  });

  it("says a supplier with 3 active flags is out, or back in by an admin's hand", () => {
    const flags = ["a", "b", "c"].map((suffix) => ({
      ...activeFlag,
      id: `${activeFlag.id}${suffix}`,
    }));
    expect(render(false, flags, false)).toContain("Fornecedor desligado: chegou a 3 flags ativas");
    expect(render(false, flags, true)).toContain("foi reativado");
    expect(render(false)).not.toContain("Fornecedor desligado");
  });

  it("names the golden rule each flag breaks and keeps the 5 rules at hand", () => {
    const markup = render(false);
    expect(markup).toContain("Regra 2: Envie exatamente o produto anunciado");
    expect(markup).toContain("Regras de ouro do fornecedor");
    expect(markup).toContain("Converse só pela SellBridge");
  });
});
