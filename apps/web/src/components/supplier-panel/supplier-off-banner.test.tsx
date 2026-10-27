import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { SupplierOffBanner } = await import("./supplier-off-banner");

describe("SupplierOffBanner", () => {
  it("says the account is off without naming a cause an admin may not have had", () => {
    const markup = renderToStaticMarkup(<SupplierOffBanner />);
    expect(markup).toContain("Sua conta de fornecedor está desligada");
    expect(markup).toContain("entregue todos normalmente");
    expect(markup).toContain("Pedir revisão ao suporte");
    expect(markup).not.toContain("3 flags");
  });
});
