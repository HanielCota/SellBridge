import { describe, expect, it } from "vitest";
import {
  cancellationWarning,
  formatMonth,
  lateDispatchWarning,
  monthsFromFirstSale,
  formatOrders,
  formatShareDetail,
  formatShareRate,
  formatStockUnits,
} from "./operation-format";

const DISPATCHES = { one: "envio", many: "envios", none: "Nenhum envio para medir" };

describe("formatShareRate", () => {
  it("reads the share as a Brazilian percentage", () => {
    const text = formatShareRate({ part: 3, total: 40, rate: 0.075 });

    expect(text).toBe("7,5%");
  });

  it("shows a dash when there is nothing to count", () => {
    const text = formatShareRate({ part: 0, total: 0, rate: null });

    expect(text).toBe("—");
  });
});

describe("formatShareDetail", () => {
  it("says the part and the whole", () => {
    const text = formatShareDetail({ part: 3, total: 40, rate: 0.075 }, DISPATCHES);

    expect(text).toBe("3 de 40 envios");
  });

  it("uses the singular for a single parcel", () => {
    const text = formatShareDetail({ part: 0, total: 1, rate: 0 }, DISPATCHES);

    expect(text).toBe("0 de 1 envio");
  });

  it("says what is missing when nothing counted", () => {
    const text = formatShareDetail({ part: 0, total: 0, rate: null }, DISPATCHES);

    expect(text).toBe("Nenhum envio para medir");
  });
});

describe("lateDispatchWarning", () => {
  it("says nothing while nine in ten parcels leave on time", () => {
    const warning = lateDispatchWarning({ part: 1, total: 11, rate: 1 / 11 });

    expect(warning).toBeNull();
  });

  it("warns between the target and the floor of the performance strip", () => {
    const warning = lateDispatchWarning({ part: 3, total: 20, rate: 0.15 });

    expect(warning).toEqual({ tone: "warning", label: "Perto do limite" });
  });

  it("turns red past the floor", () => {
    const warning = lateDispatchWarning({ part: 5, total: 20, rate: 0.25 });

    expect(warning).toEqual({ tone: "danger", label: "Acima do limite" });
  });

  it("keeps calm when too few parcels were measured", () => {
    const warning = lateDispatchWarning({ part: 2, total: 4, rate: 0.5 });

    expect(warning).toBeNull();
  });

  it("says nothing when there is nothing to measure", () => {
    expect(lateDispatchWarning({ part: 0, total: 0, rate: null })).toBeNull();
  });
});

describe("cancellationWarning", () => {
  it("turns red past the line where the public score loses points", () => {
    const warning = cancellationWarning({ part: 1, total: 12, rate: 1 / 12 });

    expect(warning).toEqual({ tone: "danger", label: "Acima do limite" });
  });

  it("says nothing inside the target", () => {
    const warning = cancellationWarning({ part: 1, total: 100, rate: 0.01 });

    expect(warning).toBeNull();
  });

  it("keeps calm when too few orders were counted", () => {
    const warning = cancellationWarning({ part: 1, total: 3, rate: 1 / 3 });

    expect(warning).toBeNull();
  });
});

describe("monthsFromFirstSale", () => {
  it("drops the empty months before the first sale and keeps the later ones", () => {
    const months = [
      { date: "2026-01-01", orders: 0 },
      { date: "2026-02-01", orders: 3 },
      { date: "2026-03-01", orders: 0 },
      { date: "2026-04-01", orders: 5 },
    ];

    const kept = monthsFromFirstSale(months);

    expect(kept.map((month) => month.date)).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("gives nothing back when no month sold", () => {
    expect(monthsFromFirstSale([{ date: "2026-01-01", orders: 0 }])).toEqual([]);
  });

  it("gives nothing back for no months", () => {
    expect(monthsFromFirstSale([])).toEqual([]);
  });
});

describe("formatMonth", () => {
  it("names the month and the year with a capital letter", () => {
    expect(formatMonth("2026-11-01")).toBe("Novembro de 2026");
  });

  it("keeps the month of the first day, whatever the server's time zone", () => {
    expect(formatMonth("2026-01-01")).toBe("Janeiro de 2026");
  });

  it("gives back text that is not a date", () => {
    expect(formatMonth("sem-data")).toBe("sem-data");
  });
});

describe("formatStockUnits", () => {
  it("counts the units in stock", () => {
    expect(formatStockUnits(1200)).toBe("1.200 unidades em estoque");
  });

  it("uses the singular for one unit", () => {
    expect(formatStockUnits(1)).toBe("1 unidade em estoque");
  });

  it("says nothing for zero, negative and invalid stock", () => {
    expect(formatStockUnits(0)).toBeNull();
    expect(formatStockUnits(-3)).toBeNull();
    expect(formatStockUnits(Number.NaN)).toBeNull();
  });
});

describe("formatOrders", () => {
  it("counts the orders", () => {
    expect(formatOrders(1)).toBe("1 pedido");
    expect(formatOrders(12)).toBe("12 pedidos");
  });
});
