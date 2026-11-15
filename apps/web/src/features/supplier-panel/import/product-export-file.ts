import type { CatalogListSearch } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { supplierFileSlug } from "@/features/supplier-panel/report/supplier-report-csv";
import { brazilDayKey } from "@/lib/relative-time";

/** Where the product export lives; the tab's profile goes in `?perfil=`, the list filters too. */
export const PRODUCT_EXPORT_PATH = "/api/fornecedor/exportar/catalogo";

const FALLBACK_FILE_NAME = "produtos.csv";

export type ProductExportFilters = Pick<CatalogListSearch, "status" | "query" | "fiscal">;

/** The export address with the list's filters; the defaults stay out, as in the page's own URL. */
export function productExportHref(filters: ProductExportFilters): string {
  const search = new URLSearchParams();
  if (filters.status !== "all") {
    search.set("status", filters.status);
  }
  if (filters.query !== undefined && filters.query.trim() !== "") {
    search.set("query", filters.query);
  }
  if (filters.fiscal !== "all") {
    search.set("fiscal", filters.fiscal);
  }
  const query = search.toString();
  return query === "" ? PRODUCT_EXPORT_PATH : `${PRODUCT_EXPORT_PATH}?${query}`;
}

/** "produtos-atelie-divinopolis-2026-11-14.csv": the brand and the day in Brazil. */
export function productExportFileName(supplierName: string, now: Date): string {
  return `produtos-${supplierFileSlug(supplierName)}-${brazilDayKey(now)}.csv`;
}

/** The name the server gave the file (`attachment; filename="…"`), or a plain one without it. */
export function fileNameFromDisposition(header: string | null): string {
  const name = header === null ? undefined : /filename="([^"]+)"/.exec(header)?.[1];
  if (name === undefined || name.trim() === "") {
    return FALLBACK_FILE_NAME;
  }
  return name;
}

const countFormat = new Intl.NumberFormat("pt-BR");

/** What "Baixar produtos" takes: the list as filtered, said with its count. */
export function exportDescription(count: number | undefined, filtered: boolean): string {
  if (count === undefined) {
    return "Seus produtos, prontos para editar e importar de volta";
  }
  if (count === 0) {
    return "Nenhum produto nesta lista para baixar";
  }
  if (count === 1) {
    return filtered
      ? "O produto desta busca ou filtro, pronto para editar e importar de volta"
      : "Seu produto, pronto para editar e importar de volta";
  }
  const products = `${countFormat.format(count)} produtos`;
  if (filtered) {
    return `Os ${products} desta busca ou filtro, prontos para editar e importar de volta`;
  }
  return `Todos os seus ${products}, prontos para editar e importar de volta`;
}
