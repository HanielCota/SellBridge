import { describe, expect, it } from "vitest";
import {
  formatMonth,
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

  it("reads zero, negative and invalid stock as none", () => {
    expect(formatStockUnits(0)).toBe("Nenhuma unidade em estoque");
    expect(formatStockUnits(-3)).toBe("Nenhuma unidade em estoque");
    expect(formatStockUnits(Number.NaN)).toBe("Nenhuma unidade em estoque");
  });
});

describe("formatOrders", () => {
  it("counts the orders", () => {
    expect(formatOrders(1)).toBe("1 pedido");
    expect(formatOrders(12)).toBe("12 pedidos");
  });
});
