import { stripAccents } from "./text.ts";

/**
 * What each column of the product spreadsheet takes, in the words the supplier reads in the
 * error list, the template help and the downloadable guide. The column names and rules are
 * product-csv's (the source of truth); `supplier-panel-import-columns.test.ts` checks they agree.
 */
export interface ImportColumnGuide {
  readonly column: string;
  /** The label product-csv uses in its reasons ("Custo: valor inválido"). */
  readonly label: string;
  readonly required: boolean;
  readonly format: string;
  readonly example: string;
}

const MONEY_FORMAT =
  "Valor em reais com até 2 casas, como 12,90, sem R$ nem ponto de milhar, até 1000000,00";

export const IMPORT_COLUMNS: readonly ImportColumnGuide[] = [
  {
    column: "sku",
    label: "SKU",
    required: true,
    format: "Código de 1 a 100 caracteres, sem repetir no arquivo",
    example: "CAMISETA-AZUL-M",
  },
  {
    column: "titulo",
    label: "Título",
    required: true,
    format: "Texto de 1 a 300 caracteres",
    example: "Camiseta básica azul M",
  },
  {
    column: "descricao",
    label: "Descrição",
    required: false,
    format: "Texto de até 20.000 caracteres",
    example: "Algodão penteado, gola careca",
  },
  { column: "custo", label: "Custo", required: true, format: MONEY_FORMAT, example: "29,90" },
  {
    column: "estoque",
    label: "Estoque",
    required: true,
    format: "Número inteiro de 0 a 10000000, sem ponto",
    example: "25",
  },
  {
    column: "categoria",
    label: "Categoria",
    required: false,
    format: "Identificador da lista de categorias, ou vazio",
    example: "moda",
  },
  {
    column: "imagens",
    label: "Imagens",
    required: false,
    format: "Até 20 links https, separados por |",
    example: "https://exemplo.com/foto-1.jpg|https://exemplo.com/foto-2.jpg",
  },
  {
    column: "ativo",
    label: "Ativo",
    required: false,
    format: "sim ou não, vazio mantém o atual",
    example: "sim",
  },
  {
    column: "preco_sugerido",
    label: "Preço sugerido",
    required: false,
    format: `${MONEY_FORMAT}, vazio mantém o atual`,
    example: "59,90",
  },
  {
    column: "marca",
    label: "Marca",
    required: false,
    format: "Até 255 caracteres, exigido pelo Mercado Livre em muitas categorias",
    example: "Marca Exemplo",
  },
  {
    column: "modelo",
    label: "Modelo",
    required: false,
    format: "Até 255 caracteres, exigido pelo Mercado Livre em muitas categorias",
    example: "CB-01",
  },
  {
    column: "gtin",
    label: "GTIN",
    required: false,
    format: "Código de barras de 8, 12, 13 ou 14 dígitos, com dígito verificador certo",
    example: "7891234567895",
  },
  {
    column: "peso_g",
    label: "Peso",
    required: false,
    format: "Peso da embalagem em g, de 0,1 a 100000, com até 1 casa decimal",
    example: "350",
  },
  ...(
    [
      ["altura_cm", "Altura", "10"],
      ["largura_cm", "Largura", "15"],
      ["comprimento_cm", "Comprimento", "20"],
    ] as const
  ).map(([column, label, example]) => ({
    column,
    label,
    required: false,
    format: `${label} da embalagem em cm, de 0,1 a 300, com até 1 casa decimal`,
    example,
  })),
];

/** Exported files carry the reason for each failed row here; a re-import ignores it. */
export const IMPORT_ERROR_COLUMN = "erro";

/** "Preço sugerido" or " SKU " → the template's name ("preco_sugerido", "sku"). */
export function canonicalColumnName(header: string): string {
  return stripAccents(header).trim().toLowerCase().replace(/\s+/g, "_");
}

export function columnGuide(column: string): ImportColumnGuide | null {
  return IMPORT_COLUMNS.find((entry) => entry.column === column) ?? null;
}

export function columnGuideByLabel(label: string): ImportColumnGuide | null {
  return IMPORT_COLUMNS.find((entry) => entry.label === label.trim()) ?? null;
}

/** 0 → "A", 26 → "AA": the letter Excel shows above the column. */
export function spreadsheetColumnLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  if (index < 26) {
    return letter;
  }
  return `${spreadsheetColumnLetter(Math.floor(index / 26) - 1)}${letter}`;
}
