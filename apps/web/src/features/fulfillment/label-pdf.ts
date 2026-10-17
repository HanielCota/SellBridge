import { validationError } from "@sellbridge/shared/errors";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { OCR_IMAGE_SIDE } from "./label-ocr";

/** A label sits on the first pages; the rest of a long PDF is invoices and declarations. */
const MAX_LABEL_PAGES = 4;
/** Text pieces closer than this (in PDF points) vertically print on the same line. */
const SAME_LINE_TOLERANCE = 2;
/** A horizontal gap wider than this between two pieces is a space. */
const WORD_GAP = 1;

/** What a PDF label offers: its text, or page images when the address is not text (a scan). */
export type PdfLabel =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "images"; readonly pages: readonly HTMLCanvasElement[] };

/**
 * Opens a PDF label in the browser. When `hasAddress` finds no address in its text (a scanned or
 * printed-as-image label), its first pages come back as images for OCR instead.
 */
export async function readPdfLabel(
  file: File,
  hasAddress: (text: string) => boolean,
): Promise<PdfLabel> {
  // Loaded on demand: the PDF reader is large and only this button needs it.
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    const text = await documentText(document);
    if (hasAddress(text)) return { kind: "text", text };
    return { kind: "images", pages: await renderPages(document) };
  } catch (error) {
    throw validationError("Não foi possível abrir este PDF. Confira se o arquivo é a etiqueta.", [
      error instanceof Error ? error.name : "UnknownError",
    ]);
  } finally {
    await task.destroy();
  }
}

function labelPageNumbers(document: PDFDocumentProxy): readonly number[] {
  const pageCount = Math.min(document.numPages, MAX_LABEL_PAGES);
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

async function documentText(document: PDFDocumentProxy): Promise<string> {
  const pages = await Promise.all(
    labelPageNumbers(document).map(async (pageNumber) => {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return textFromItems(content.items.filter(isTextItem));
    }),
  );
  return pages.join("\n");
}

/** One page at a time: each canvas holds a few megabytes of pixels. */
async function renderPages(document: PDFDocumentProxy): Promise<HTMLCanvasElement[]> {
  const canvases: HTMLCanvasElement[] = [];
  for (const pageNumber of labelPageNumbers(document)) {
    const page = await document.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: OCR_IMAGE_SIDE / Math.max(base.width, base.height),
    });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
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
