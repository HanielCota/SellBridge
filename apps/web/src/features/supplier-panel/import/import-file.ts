import { validationError } from "@sellbridge/shared/errors";
import { MAX_PRODUCT_CSV_BYTES } from "@sellbridge/shared/schemas";

/** Browser helpers of the import screen: check and encode the chosen file, save a download. */

const ACCEPTED_EXTENSIONS = [".csv", ".txt", ".tsv", ".xlsx"];
/** btoa takes a string; building it in slices keeps the call stack small for a 2 MB file. */
const BASE64_SLICE = 0x8000;

export function assertImportableFile(file: { name: string; size: number }): void {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) {
    throw validationError("Arquivos .xls não são aceitos; no Excel, salve como .xlsx ou CSV");
  }
  if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw validationError("Formato não aceito; envie .xlsx ou .csv");
  }
  if (file.size === 0) {
    throw validationError("O arquivo está vazio; escolha a planilha com os produtos");
  }
  if (file.size > MAX_PRODUCT_CSV_BYTES) {
    throw validationError("O arquivo passa de 2 MB; divida a planilha em partes menores");
  }
}

export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += BASE64_SLICE) {
    parts.push(String.fromCharCode(...bytes.subarray(start, start + BASE64_SLICE)));
  }
  return btoa(parts.join(""));
}

export function downloadCsv(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on the next task: some browsers start the download only after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "produtos.xlsx" → "produtos-com-erro.csv". */
export function failedRowsFileName(original: string): string {
  const base = original.replace(/\.[^.]+$/, "").trim();
  return `${base.length > 0 ? base : "produtos"}-com-erro.csv`;
}
