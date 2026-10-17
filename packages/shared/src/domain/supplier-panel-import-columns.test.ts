import { describe, expect, it } from "vitest";
import { PRODUCT_CSV_TEMPLATE, parseProductCsv } from "./product-csv.ts";
import { IMPORT_COLUMNS, spreadsheetColumnLetter } from "./supplier-panel-import-columns.ts";
import { buildImportGuideCsv, buildImportTemplateCsv } from "./supplier-panel-import-files.ts";

/** The guide restates product-csv's rules; these checks fail when the two drift apart. */
describe("IMPORT_COLUMNS", () => {
  it("lists exactly the columns of the admin template", () => {
    const templateHeader = PRODUCT_CSV_TEMPLATE.replace(/^\uFEFF/, "").split("\r\n")[0] ?? "";
    expect(IMPORT_COLUMNS.map((entry) => entry.column).toSorted()).toEqual(
      templateHeader.split(";").toSorted(),
    );
  });

  it.each(IMPORT_COLUMNS.filter((entry) => entry.required))(
    "marks $column as required, as product-csv does",
    ({ column }) => {
      const others = ["sku", "titulo", "custo", "estoque"].filter((name) => name !== column);
      expect(() =>
        parseProductCsv(`${others.join(";")}\n${others.map(() => "1").join(";")}`),
      ).toThrow("Cabeçalho inválido");
    },
  );

  it("gives product-csv examples it accepts", () => {
    const template = buildImportTemplateCsv(null);
    expect(parseProductCsv(template).errors).toEqual([]);
  });
});

describe("downloads", () => {
  it("puts a real category in the template example when there is one", () => {
    expect(buildImportTemplateCsv("moda").split("\r\n")[1]).toContain(";moda;");
  });

  it("lists every column and every category in the guide", () => {
    const guide = buildImportGuideCsv([{ name: "Casa e cozinha", slug: "casa" }]);
    expect(guide.startsWith("\uFEFFcoluna;obrigatória;formato;exemplo")).toBe(true);
    expect(guide).toContain("\r\ncasa;Casa e cozinha;;");
    expect(guide.split("\r\n").filter((line) => line.startsWith("sku;sim;"))).toHaveLength(1);
  });

  it("spells spreadsheet column letters past Z", () => {
    expect([0, 25, 26, 51, 52].map(spreadsheetColumnLetter)).toEqual(["A", "Z", "AA", "AZ", "BA"]);
  });
});
