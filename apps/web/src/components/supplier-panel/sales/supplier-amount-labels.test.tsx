import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const { SupplierKpiTiles } = await import("./supplier-kpi-tiles");
const { SupplierChartHeadline } = await import("./supplier-sales-chart");

const totals = {
  orders: 3,
  units: 5,
  receivableCents: 16_000,
  resellers: 2,
  averageOrderCents: 5_333,
};
const points = [{ date: "2026-10-20", orders: 3, units: 5, receivableCents: 16_000 }];

function textOf(markup: string): string {
  return markup.replaceAll(/<[^>]+>/g, " ");
}

function tiles(situation: "sold" | "lost"): string {
  return textOf(
    renderToStaticMarkup(
      <TooltipProvider>
        <SupplierKpiTiles
          summary={totals}
          previous={totals}
          points={points}
          situation={situation}
        />
      </TooltipProvider>,
    ),
  );
}

function headline(situation: "sold" | "lost", series: "receivable" | "units"): string {
  return textOf(
    renderToStaticMarkup(
      <SupplierChartHeadline
        summary={totals}
        previous={totals}
        series={series}
        situation={situation}
      />,
    ),
  );
}

describe("supplier home amount labels", () => {
  it("names the money to receive for the orders that count as sales", () => {
    expect(tiles("sold")).toContain("A receber");
    expect(tiles("sold")).toContain("Peças vendidas");
    expect(headline("sold", "receivable")).toContain("A receber no período");
  });

  it("names cancelled and returned orders as money left out, never as money to receive", () => {
    const text = `${tiles("lost")} ${headline("lost", "receivable")} ${headline("lost", "units")}`;
    expect(text).not.toContain("A receber");
    expect(text).not.toContain("Peças vendidas");
    expect(tiles("lost")).toContain("Ficou de fora");
    expect(headline("lost", "receivable")).toContain("Ficou de fora no período");
    expect(headline("lost", "units")).toContain("Peças canceladas ou devolvidas no período");
  });
});
