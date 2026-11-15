import { queryOptions } from "@tanstack/react-query";
import { supplierImportFiles } from "./supplier-import.functions";

const IMPORT_FILES_STALE_MS = 5 * 60 * 1000;

/** The template, the column guide and the categories: the import page and the Produtos menu. */
export const supplierImportFilesQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: ["supplier-panel", "import-files", supplierId],
    queryFn: async () => await supplierImportFiles({ data: { supplierId } }),
    staleTime: IMPORT_FILES_STALE_MS,
  });
