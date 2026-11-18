import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { ManualTracking } = await import("./tracking-parcel");

const CODE = "ZX123456789BR";

describe("ManualTracking", () => {
  it("never claims a carrier lookup while none is connected", () => {
    const markup = renderToStaticMarkup(
      <ManualTracking
        result={{
          kind: "manual",
          code: CODE,
          carrierTracking: { state: "not_connected" },
          explanation: null,
        }}
      />,
    );

    expect(markup).toContain("Este código não está em nenhum pedido seu.");
    expect(markup).not.toContain("Consultamos direto na transportadora");
    expect(markup).toContain("A consulta direto na transportadora ainda não está ligada");
    expect(markup).toContain("use o site dos Correios");
  });

  it("says the carrier was read when it answered", () => {
    const markup = renderToStaticMarkup(
      <ManualTracking
        result={{
          kind: "manual",
          code: CODE,
          carrierTracking: { state: "not_found" },
          explanation: null,
        }}
      />,
    );

    expect(markup).toContain("Consultamos direto na transportadora.");
    expect(markup).toContain("A transportadora ainda não conhece este código.");
  });

  it("does not claim a carrier lookup when the carrier could not be reached", () => {
    const markup = renderToStaticMarkup(
      <ManualTracking
        result={{
          kind: "manual",
          code: CODE,
          carrierTracking: { state: "unavailable" },
          explanation: null,
        }}
      />,
    );

    expect(markup).not.toContain("Consultamos direto na transportadora");
    expect(markup).toContain("Não conseguimos consultar a transportadora agora.");
  });
});
