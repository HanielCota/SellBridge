import { validationError } from "@sellbridge/shared/errors";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { isZpl, zplToText } from "./zpl-text";

/** The same ceiling the marketplace label download uses. */
const MAX_LABEL_BYTES = 10 * 1024 * 1024;
/** A label sits on the first pages; the rest of a long PDF is invoices and declarations. */
const MAX_LABEL_PAGES = 4;
/** Text pieces closer than this (in PDF points) vertically print on the same line. */
const SAME_LINE_TOLERANCE = 2;
/** A horizontal gap wider than this between two pieces is a space. */
const WORD_GAP = 1;
export const LABEL_FILE_ACCEPT = ".pdf,.zpl,.txt,application/pdf,text/plain";

/**
 * The text of a shipping label file, read in the browser: the buyer's address never leaves the
 * reseller's machine. PDF labels need real text (not a scanned image); ZPL and plain text work too.
 */
export async function readLabelText(file: File): Promise<string> {
  if (file.size > MAX_LABEL_BYTES) {
    const megabytes = (file.size / 1024 / 1024).toFixed(1);
    throw validationError(`A etiqueta tem ${megabytes} MB; o limite é 10 MB.`);
  }
  if (isPdf(file)) return readPdfText(file);
  if (isTextFile(file)) {
    const text = await file.text();
    return isZpl(text) ? zplToText(text) : text;
  }
  throw validationError(
    `O arquivo "${file.name}" não é aceito: envie a etiqueta em PDF, ZPL ou TXT.`,
  );
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isTextFile(file: File): boolean {
  return file.type === "text/plain" || /\.(zpl|txt)$/i.test(file.name);
}

async function readPdfText(file: File): Promise<string> {
  // Loaded on demand: the PDF reader is large and only this button needs it.
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  try {
    const document = await task.promise;
    const pageCount = Math.min(document.numPages, MAX_LABEL_PAGES);
    const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = await Promise.all(
      pageNumbers.map(async (pageNumber) => {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        return textFromItems(content.items.filter(isTextItem));
      }),
    );
    return pages.join("\n");
  } catch (error) {
    throw validationError("Não foi possível abrir este PDF. Confira se o arquivo é a etiqueta.", [
      error instanceof Error ? error.name : "UnknownError",
    ]);
  } finally {
    await task.destroy();
  }
}

function isTextItem(item: object): item is TextItem {
  return "str" in item && "transform" in item;
}

/** Rebuilds the printed lines from the PDF's positioned text pieces. */
function textFromItems(items: readonly TextItem[]): string {
  return items
    .map((item, index) => {
      const previous = items[index - 1];
      if (previous === undefined) return item.str;
      return separatorBetween(previous, item) + item.str;
    })
    .join("");
}

function separatorBetween(previous: TextItem, current: TextItem): string {
  const verticalDistance = Math.abs(coordinate(previous, "y") - coordinate(current, "y"));
  if (previous.hasEOL || verticalDistance > SAME_LINE_TOLERANCE) return "\n";
  const gap = coordinate(current, "x") - (coordinate(previous, "x") + previous.width);
  return gap > WORD_GAP ? " " : "";
}

/** The piece's position: the last two entries of its transform matrix. */
function coordinate(item: TextItem, axis: "x" | "y"): number {
  const value: unknown = item.transform[axis === "x" ? 4 : 5];
  return typeof value === "number" ? value : 0;
}
