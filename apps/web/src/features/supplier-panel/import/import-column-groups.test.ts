import { IMPORT_COLUMNS } from "@sellbridge/shared/supplier-panel-import-columns";
import { describe, expect, it } from "vitest";
import { importColumnSections } from "./import-column-groups";

describe("importColumnSections", () => {
  it("shows only the required columns up front", () => {
    const { required } = importColumnSections();

    expect(required.map((entry) => entry.column)).toEqual(["sku", "titulo", "custo", "estoque"]);
  });

  it("puts every optional column of the template in exactly one group", () => {
    const { optional } = importColumnSections();

    const grouped = optional.flatMap((group) => group.columns.map((entry) => entry.column));
    const optionalColumns = IMPORT_COLUMNS.filter((entry) => !entry.required).map(
      (entry) => entry.column,
    );
    expect(grouped.toSorted()).toEqual(optionalColumns.toSorted());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("groups the optional columns by subject", () => {
    const { optional } = importColumnSections();

    expect(optional.map((group) => [group.title, group.columns.length])).toEqual([
      ["Detalhes do produto", 8],
      ["Medidas e peso", 5],
      ["Dados fiscais", 8],
    ]);
  });
});
