import { describe, expect, it } from "vitest";
import { stockForecast } from "./stock-forecast";

describe("stockForecast", () => {
  it("warns when the stock runs out within two weeks", () => {
    expect(stockForecast(5)).toEqual({ tone: "danger", label: "Acaba em ~5 dias" });
    expect(stockForecast(1)).toEqual({ tone: "danger", label: "Acaba em ~1 dia" });
  });

  it("says there is no stock left", () => {
    expect(stockForecast(0)).toEqual({ tone: "danger", label: "Sem estoque" });
  });

  it("reads a comfortable stock in days, and a long one as more than 90", () => {
    expect(stockForecast(40)).toEqual({ tone: "success", label: "Estoque para ~40 dias" });
    expect(stockForecast(400)).toEqual({ tone: "success", label: "Estoque para mais de 90 dias" });
  });

  it("has no forecast without sales", () => {
    expect(stockForecast(null)).toEqual({ tone: "muted", label: "Sem previsão de estoque" });
  });
});
