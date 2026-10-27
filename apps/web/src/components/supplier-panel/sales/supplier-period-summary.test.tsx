import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupplierPeriodSummary } from "./supplier-period-summary";

const points = [
  { date: "2026-10-20", receivableCents: 12_000 },
  { date: "2026-10-21", receivableCents: 4_000 },
];

function textOf(markup: string): string {
  return markup.replaceAll(/<[^>]+>/g, "");
}

function render(situation: "sold" | "lost", previousOrders: number): string {
  return textOf(
    renderToStaticMarkup(
      <SupplierPeriodSummary
        current={{ receivableCents: 16_000, orders: 3 }}
        previous={{ receivableCents: previousOrders * 5_000, orders: previousOrders }}
        points={points}
        bucket="day"
        fromDate="2026-10-20"
        situation={situation}
      />,
    ),
  );
}

describe("SupplierPeriodSummary", () => {
  it("greets the first sales of a period with no sales before it", () => {
    expect(render("sold", 0)).toContain("Suas primeiras vendas chegaram");
  });

  it("reads cancelled and returned orders as money left out, never as sales or a best day", () => {
    for (const previousOrders of [0, 2]) {
      const text = render("lost", previousOrders);
      expect(text).toMatch(/Ficaram de fora R\$\s160 no período/);
      expect(text).toContain("3 pedidos cancelados ou devolvidos");
      expect(text).not.toContain("primeiras vendas");
      expect(text).not.toContain("a receber");
      expect(text).not.toContain("melhor dia");
    }
  });

  it("says no order was lost when the lost filter finds none", () => {
    const text = textOf(
      renderToStaticMarkup(
        <SupplierPeriodSummary
          current={{ receivableCents: 0, orders: 0 }}
          previous={{ receivableCents: 0, orders: 0 }}
          points={points}
          bucket="day"
          fromDate="2026-10-20"
          situation="lost"
        />,
      ),
    );
    expect(text).toContain("Nenhum pedido cancelado ou devolvido no período.");
  });
});
