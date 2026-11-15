import { formatCsvAttributes } from "./product-csv-attributes.ts";
import { formatCsvFiscal } from "./product-csv-fiscal.ts";
import { formatCsvMoney, guardFormulaCell } from "./product-csv.ts";
import { readProductFiscal } from "./product-fiscal.ts";
import { IMPORT_COLUMNS } from "./supplier-panel-import-columns.ts";

/**
 * The supplier's products as rows of the import spreadsheet: downloaded, edited in Excel and
 * imported back as they are. Every import column has a cell here, in the same order.
 */

/** A product as stored, with what the spreadsheet carries. */
export interface ProductExportSource {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  readonly costCents: number;
  readonly suggestedPriceCents: number;
  readonly stock: number;
  readonly categorySlug: string | null;
  readonly imageUrls: readonly string[];
  readonly active: boolean;
  readonly mercadoLivreAttributes: Readonly<Record<string, string>>;
  /** The stored `fiscal` column; values that no longer pass the rules come out blank. */
  readonly fiscal: unknown;
}

const IMAGE_SEPARATOR = "|";

function textCells(cells: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(cells).map(([column, value]) => [column, guardFormulaCell(value)]),
  );
}

/**
 * The product's cells in the import's column order. The SKU is never changed: it is how the
 * import finds the product to update.
 *
 * @throws {Error} When an import column has no cell here (the export fell behind the import).
 */
export function productExportRow(product: ProductExportSource): string[] {
  const cells: Record<string, string> = {
    sku: product.sku,
    titulo: guardFormulaCell(product.title),
    descricao: guardFormulaCell(product.description),
    custo: formatCsvMoney(product.costCents),
    estoque: String(product.stock),
    categoria: product.categorySlug ?? "",
    imagens: product.imageUrls.join(IMAGE_SEPARATOR),
    ativo: product.active ? "sim" : "não",
    preco_sugerido: formatCsvMoney(product.suggestedPriceCents),
    ...textCells(formatCsvAttributes(product.mercadoLivreAttributes)),
    ...formatCsvFiscal(readProductFiscal(product.fiscal)),
  };
  return IMPORT_COLUMNS.map((entry) => {
    const cell = cells[entry.column];
    if (cell === undefined) {
      throw new Error(`The product export has no cell for the import column "${entry.column}"`);
    }
    return cell;
  });
}
