import {
  IMPORT_COLUMNS,
  type ImportColumnGuide,
} from "@sellbridge/shared/supplier-panel-import-columns";

/** The optional columns of the template, by subject, in the order the panel shows them. */
const OPTIONAL_GROUPS: readonly { readonly title: string; readonly columns: readonly string[] }[] =
  [
    {
      title: "Detalhes do produto",
      columns: [
        "descricao",
        "categoria",
        "imagens",
        "ativo",
        "preco_sugerido",
        "marca",
        "modelo",
        "gtin",
      ],
    },
    {
      title: "Medidas e peso",
      columns: ["peso_g", "altura_cm", "largura_cm", "comprimento_cm", "peso_liquido_g"],
    },
    {
      title: "Dados fiscais",
      columns: [
        "ncm",
        "origem",
        "unidade",
        "cest",
        "cfop_estado",
        "cfop_fora",
        "csosn_cst",
        "cst_pis_cofins",
      ],
    },
  ];

export interface ImportColumnGroup {
  readonly title: string;
  readonly columns: readonly ImportColumnGuide[];
}

export interface ImportColumnSections {
  /** Always shown: a row without these is refused. */
  readonly required: readonly ImportColumnGuide[];
  /** Closed by default, so the panel ends near the upload instead of 25 columns below it. */
  readonly optional: readonly ImportColumnGroup[];
}

/**
 * The template's columns as the panel shows them. Throws when a column of the template has no
 * group, so a new column cannot quietly disappear from the panel.
 */
export function importColumnSections(): ImportColumnSections {
  const byColumn = new Map(IMPORT_COLUMNS.map((entry) => [entry.column, entry]));
  const optional = OPTIONAL_GROUPS.map((group) => ({
    title: group.title,
    columns: group.columns.map((column) => {
      const entry = byColumn.get(column);
      if (entry === undefined) {
        throw new Error(`Column guide group lists an unknown column: ${column}`);
      }
      return entry;
    }),
  }));
  const grouped = new Set(OPTIONAL_GROUPS.flatMap((group) => group.columns));
  const required = IMPORT_COLUMNS.filter((entry) => entry.required);
  const missing = IMPORT_COLUMNS.find((entry) => !entry.required && !grouped.has(entry.column));
  if (missing !== undefined) {
    throw new Error(`Template column without a group in the column guide: ${missing.column}`);
  }
  return { required, optional };
}
