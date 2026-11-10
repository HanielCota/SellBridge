import { describe, expect, it } from "vitest";
import {
  cestSchema,
  cfopInStateSchema,
  cfopOutOfStateSchema,
  EMPTY_PRODUCT_FISCAL,
  formatNcm,
  hasRequiredFiscalData,
  icmsCodeFitsRegime,
  icmsCodeLabel,
  isNoGtin,
  maskNcmInput,
  ncmSchema,
  readProductFiscal,
} from "./product-fiscal.ts";

describe("ncmSchema", () => {
  it("keeps the 8 digits of a masked NCM", () => {
    const result = ncmSchema.safeParse("6402.99.90");

    expect(result).toEqual({ success: true, data: "64029990" });
  });

  it("refuses the all-zero NCM the report forbids", () => {
    const result = ncmSchema.safeParse("0000.00.00");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("0000.00.00");
  });

  it("refuses an NCM without 8 digits", () => {
    expect(ncmSchema.safeParse("6402.99").success).toBe(false);
    expect(ncmSchema.safeParse("").success).toBe(false);
    expect(ncmSchema.safeParse("6402.99.9A").success).toBe(false);
  });
});

describe("cestSchema", () => {
  it("accepts 7 digits with or without dots", () => {
    expect(cestSchema.safeParse("28.063.00")).toEqual({ success: true, data: "2806300" });
  });

  it("refuses any other length", () => {
    expect(cestSchema.safeParse("280630").success).toBe(false);
  });
});

describe("CFOP", () => {
  it("takes 5xxx inside the state and 6xxx outside", () => {
    expect(cfopInStateSchema.safeParse("5102").success).toBe(true);
    expect(cfopInStateSchema.safeParse("6102").success).toBe(false);
    expect(cfopOutOfStateSchema.safeParse("6102").success).toBe(true);
    expect(cfopOutOfStateSchema.safeParse("5102").success).toBe(false);
  });
});

describe("icms code by regime", () => {
  it("asks for a CSOSN in Simples Nacional and a CST ICMS otherwise", () => {
    expect(icmsCodeFitsRegime("102", "simples")).toBe(true);
    expect(icmsCodeFitsRegime("00", "simples")).toBe(false);
    expect(icmsCodeFitsRegime("00", "presumido")).toBe(true);
    expect(icmsCodeFitsRegime("102", "real")).toBe(false);
    expect(icmsCodeLabel("simples")).toBe("CSOSN (Simples Nacional)");
    expect(icmsCodeLabel("real")).toBe("CST ICMS");
  });
});

describe("readProductFiscal", () => {
  it("reads an empty column as no fiscal data", () => {
    expect(readProductFiscal({})).toEqual(EMPTY_PRODUCT_FISCAL);
    expect(readProductFiscal(null)).toEqual(EMPTY_PRODUCT_FISCAL);
  });

  it("drops a stored value that no longer passes the rules", () => {
    const fiscal = readProductFiscal({ ncm: "00000000", origin: 0, unit: "PAR" });

    expect(fiscal).toMatchObject({ ncm: null, origin: 0, unit: "PAR" });
  });
});

describe("hasRequiredFiscalData", () => {
  it("needs NCM, origin and unit", () => {
    const complete = { ...EMPTY_PRODUCT_FISCAL, ncm: "64029990", origin: 0, unit: "PAR" as const };

    expect(hasRequiredFiscalData(complete)).toBe(true);
    expect(hasRequiredFiscalData({ ...complete, unit: null })).toBe(false);
    expect(hasRequiredFiscalData({ ...complete, origin: null })).toBe(false);
  });
});

describe("formatting", () => {
  it("masks the NCM as 0000.00.00", () => {
    expect(formatNcm("64029990")).toBe("6402.99.90");
  });

  it("recognises SEM GTIN in any case", () => {
    expect(isNoGtin(" sem gtin ")).toBe(true);
    expect(isNoGtin("7891234567895")).toBe(false);
  });
});

describe("maskNcmInput", () => {
  it("adds the dots as the digits come in and stops at 8 digits", () => {
    expect(maskNcmInput("6109")).toBe("6109");
    expect(maskNcmInput("61091")).toBe("6109.1");
    expect(maskNcmInput("6109100")).toBe("6109.10.0");
    expect(maskNcmInput("6109.10.0099")).toBe("6109.10.00");
    expect(maskNcmInput("ab")).toBe("");
  });
});
