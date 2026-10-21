import { useMutation } from "@tanstack/react-query";
import {
  buildCatalogImport,
  detectSpreadsheet,
  type CatalogCategory,
  type CatalogImport,
  type DetectedSpreadsheet,
} from "@sellbridge/shared/catalog-spreadsheet";
import { AppError, isAppError, validationError } from "@sellbridge/shared/errors";
import { MAX_PRODUCT_CSV_BYTES } from "@sellbridge/shared/schemas";
import { MAX_XLSX_BYTES, readXlsxSheets } from "@sellbridge/shared/xlsx-reader";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { adminConfirmProductCsv, adminPreviewProductCsv } from "./suppliers.functions";
import { useCatalogAction } from "./use-catalog-action";

export type SpreadsheetSummary = Omit<CatalogImport, "csv"> & {
  readonly sources: readonly Pick<DetectedSpreadsheet, "kind" | "source">[];
};

const isSpreadsheet = (file: File): boolean => /\.xlsx$/i.test(file.name);

async function readCsv(file: File): Promise<string> {
  if (file.size > MAX_PRODUCT_CSV_BYTES) {
    throw validationError("O arquivo CSV deve ter no máximo 2 MiB");
  }
  return await file.text();
}

async function detectFile(file: File): Promise<DetectedSpreadsheet[]> {
  if (file.size > MAX_XLSX_BYTES) {
    throw validationError(`A planilha ${file.name} deve ter no máximo 20 MiB`);
  }

  const sheets = await readXlsxSheets(new Uint8Array(await file.arrayBuffer()));
  const detected = sheets.flatMap((sheet) => detectSpreadsheet(sheet, file.name) ?? []);
  if (detected.length === 0) {
    throw validationError(
      `Não reconhecemos as colunas de ${file.name}. Envie o catálogo do fornecedor (EnvioVelox) ou a planilha de anúncios da Shopee`,
    );
  }
  return detected;
}

async function convertSpreadsheets(
  files: readonly File[],
  categories: readonly CatalogCategory[],
): Promise<{ content: string; summary: SpreadsheetSummary }> {
  const sheets = (await Promise.all(files.map(detectFile))).flat();
  const { csv, ...summary } = buildCatalogImport({ sheets, categories });
  const sources = sheets.map(({ kind, source }) => ({ kind, source }));
  return { content: csv, summary: { ...summary, sources } };
}

async function readSelection(
  files: readonly File[],
  categories: readonly CatalogCategory[],
): Promise<{ content: string; summary: SpreadsheetSummary | null }> {
  const spreadsheets = files.filter(isSpreadsheet);
  if (spreadsheets.length === files.length) {
    return await convertSpreadsheets(files, categories);
  }

  if (spreadsheets.length > 0 || files.length > 1) {
    throw validationError("Envie um único CSV ou apenas planilhas .xlsx");
  }

  const [file] = files;
  if (file == null) {
    return { content: "", summary: null };
  }
  return { content: await readCsv(file), summary: null };
}

export function useProductCsv(supplierId: string, categories: readonly CatalogCategory[]) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<SpreadsheetSummary | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const preview = useMutation({ mutationFn: adminPreviewProductCsv });
  const apply = useCatalogAction(adminConfirmProductCsv, "Importação concluída", () =>
    preview.reset(),
  );
  async function selectFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    preview.reset();
    apply.reset();
    setContent("");
    setSummary(null);
    setFileName(files.map((file) => file.name).join(", "));
    setFileError(null);
    if (files.length === 0) {
      return;
    }

    setIsReading(true);
    try {
      const selection = await readSelection(files, categories);
      setContent(selection.content);
      setSummary(selection.summary);
    } catch (error) {
      const failure = isAppError(error)
        ? error
        : new AppError("VALIDATION", "Não foi possível ler o arquivo", { cause: error });
      setFileError(errorMessage(failure));
    } finally {
      setIsReading(false);
    }
  }
  function confirm() {
    if (!preview.data || preview.data.errors.length > 0) {
      return;
    }
    apply.mutate({ data: { supplierId, content, previewToken: preview.data.previewToken } });
  }
  return {
    fileName,
    fileError,
    isReading,
    summary,
    preview,
    apply,
    selectFiles,
    confirm,
    generatePreview: () => preview.mutate({ data: { supplierId, content } }),
    canPreview: content.length > 0,
  };
}
