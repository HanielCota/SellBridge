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
  icmsOverrideProblem,
  isNoGtin,
  maskNcmInput,
  ncmSchema,
  readProductFiscal,
  withFiscalFallback,
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

  it("refuses a product's own CST ICMS for a Simples Nacional supplier", () => {
    expect(icmsOverrideProblem("00", "simples")).toContain("CSOSN");
  });

  it("accepts a fitting code, no code, or a supplier without a regime yet", () => {
    expect(icmsOverrideProblem("102", "simples")).toBeNull();
    expect(icmsOverrideProblem(null, "simples")).toBeNull();
    expect(icmsOverrideProblem("00", null)).toBeNull();
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

describe("withFiscalFallback", () => {
  const brand = { origin: 0, unit: "UN" } as const;

  it("fills an empty origin and unit with the ones saved in Marca", () => {
    const fiscal = { ...EMPTY_PRODUCT_FISCAL, ncm: "61091000" };

    const read = withFiscalFallback(fiscal, brand);

    expect(read).toMatchObject({ ncm: "61091000", origin: 0, unit: "UN" });
    expect(hasRequiredFiscalData(read)).toBe(true);
  });

  it("keeps the product's own origin and unit over Marca's", () => {
    const fiscal = { ...EMPTY_PRODUCT_FISCAL, origin: 1, unit: "PAR" as const };

    const read = withFiscalFallback(fiscal, brand);

    expect(read).toMatchObject({ origin: 1, unit: "PAR" });
  });

  it("changes nothing when Marca has no fiscal data", () => {
    const read = withFiscalFallback(EMPTY_PRODUCT_FISCAL, null);

    expect(read).toEqual(EMPTY_PRODUCT_FISCAL);
  });

  it("never lends an NCM, which has no default", () => {
    const read = withFiscalFallback(EMPTY_PRODUCT_FISCAL, brand);

    expect(read.ncm).toBeNull();
    expect(hasRequiredFiscalData(read)).toBe(false);
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
