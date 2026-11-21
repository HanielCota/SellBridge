import { describe, expect, test } from "vitest";
import { manualRefundDeadlineLine } from "./manual-refund-copy";

// The last moment before a guarantee ending on 20/12/2026 (start of the day in Brasília).
const LAST_MOMENT = new Date("2026-12-20T02:59:59.999Z");

describe("manualRefundDeadlineLine", () => {
  test("asks the team to give the money back by the last whole day", () => {
    const line = manualRefundDeadlineLine(LAST_MOMENT, new Date("2026-12-19T20:00:00Z"));

    expect(line).toEqual({
      passed: false,
      text: "Devolva até 19/12/2026. Depois dessa data o Asaas libera o valor ao fornecedor.",
    });
  });

  test("says the money already went to the supplier once the deadline passed", () => {
    const line = manualRefundDeadlineLine(LAST_MOMENT, new Date("2026-12-20T03:00:00Z"));

    expect(line).toEqual({
      passed: true,
      text: "O prazo acabou em 19/12/2026 e o Asaas já liberou o valor ao fornecedor. Combine com ele como devolver ao revendedor.",
    });
  });
});
