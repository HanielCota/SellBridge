import { describe, expect, it } from "vitest";
import { invoiceServiceFrom } from "./invoice-config.ts";

const MINIMAL = {
  ASAAS_INVOICE_SERVICE_ID: "42",
  ASAAS_INVOICE_SERVICE_NAME: "Licenciamento de software",
  ASAAS_INVOICE_ISS_PERCENT: "2",
};

function problemsOf(environment: Record<string, string>) {
  const setting = invoiceServiceFrom(environment);
  if (setting.kind !== "invalid") throw new Error(`expected invalid, got ${setting.kind}`);
  return setting.problems.join(" | ");
}

describe("invoiceServiceFrom", () => {
  it("stays off while no invoice value is set, whatever else the environment has", () => {
    expect(invoiceServiceFrom({})).toEqual({ kind: "off" });
    expect(invoiceServiceFrom({ ASAAS_INVOICE_ISS_PERCENT: undefined })).toEqual({ kind: "off" });
    const unrelated: Record<string, string> = { ASAAS_API_KEY: "key" };
    expect(invoiceServiceFrom(unrelated)).toEqual({ kind: "off" });
  });

  it("turns on with the service id, its name and the ISS, the withheld taxes at zero", () => {
    expect(invoiceServiceFrom(MINIMAL)).toEqual({
      kind: "on",
      service: {
        service: { kind: "id", id: "42", name: "Licenciamento de software" },
        taxes: {
          retainIss: false,
          issPercent: 2,
          pisPercent: 0,
          cofinsPercent: 0,
          csllPercent: 0,
          inssPercent: 0,
          irPercent: 0,
          nbsCode: null,
          pisCofinsTaxStatus: null,
          operationPisPercent: null,
          operationCofinsPercent: null,
        },
      },
    });
  });

  it("uses the municipal code when the city has no service list", () => {
    const setting = invoiceServiceFrom({
      ASAAS_INVOICE_SERVICE_CODE: "1.03",
      ASAAS_INVOICE_SERVICE_NAME: "Processamento de dados",
      ASAAS_INVOICE_ISS_PERCENT: "2.5",
    });

    expect(setting).toMatchObject({
      kind: "on",
      service: {
        service: { kind: "code", code: "1.03", name: "Processamento de dados" },
        taxes: { issPercent: 2.5 },
      },
    });
  });

  it("reads the retained ISS, withheld rates and the regime normal fields", () => {
    const setting = invoiceServiceFrom({
      ...MINIMAL,
      ASAAS_INVOICE_RETAIN_ISS: "true",
      ASAAS_INVOICE_IR_PERCENT: "1.5",
      ASAAS_INVOICE_NBS_CODE: "1.1502.10.00",
      ASAAS_INVOICE_PIS_COFINS_STATUS: "STANDARD_TAXABLE_OPERATION",
      ASAAS_INVOICE_OPERATION_PIS_PERCENT: "0.65",
      ASAAS_INVOICE_OPERATION_COFINS_PERCENT: "3",
    });

    expect(setting).toMatchObject({
      kind: "on",
      service: {
        taxes: {
          retainIss: true,
          irPercent: 1.5,
          nbsCode: "1.1502.10.00",
          pisCofinsTaxStatus: "STANDARD_TAXABLE_OPERATION",
          operationPisPercent: 0.65,
          operationCofinsPercent: 3,
        },
      },
    });
  });

  it("refuses a comma as the decimal separator", () => {
    expect(problemsOf({ ...MINIMAL, ASAAS_INVOICE_ISS_PERCENT: "2,5" })).toContain(
      "ASAAS_INVOICE_ISS_PERCENT: use ponto",
    );
  });

  it("refuses a rate above 100%", () => {
    expect(problemsOf({ ...MINIMAL, ASAAS_INVOICE_PIS_PERCENT: "120" })).toContain(
      "ASAAS_INVOICE_PIS_PERCENT",
    );
  });

  it("names every missing value when only some are set", () => {
    const problems = problemsOf({ ASAAS_INVOICE_ISS_PERCENT: "2" });

    expect(problems).toContain("ASAAS_INVOICE_SERVICE_NAME: obrigatória");
    expect(problems).toContain("ASAAS_INVOICE_SERVICE_ID ou ASAAS_INVOICE_SERVICE_CODE");
  });

  it("asks for the ISS when the service is set without it", () => {
    const { ASAAS_INVOICE_ISS_PERCENT: _left, ...withoutIss } = MINIMAL;

    expect(problemsOf(withoutIss)).toContain("ASAAS_INVOICE_ISS_PERCENT: obrigatória");
  });

  it("refuses the service id and code together", () => {
    expect(problemsOf({ ...MINIMAL, ASAAS_INVOICE_SERVICE_CODE: "1.03" })).toContain(
      "defina só um dos dois",
    );
  });

  it("refuses a retained ISS flag that is not true or false", () => {
    expect(problemsOf({ ...MINIMAL, ASAAS_INVOICE_RETAIN_ISS: "sim" })).toContain(
      "ASAAS_INVOICE_RETAIN_ISS",
    );
  });
});
