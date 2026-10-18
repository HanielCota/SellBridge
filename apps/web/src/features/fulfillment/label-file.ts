import { validationError } from "@sellbridge/shared/errors";
import { formatFileSize } from "@/lib/file-size";
import { imageToCanvas, recognizeText } from "./label-ocr";
import { readPdfLabel } from "./label-pdf";
import { type LabelAddress, parseShippingLabel } from "./shipping-label";
import { isZpl, zplToText } from "./zpl-text";

/** The same ceiling the marketplace label download uses; phone photos stay well under it. */
const MAX_LABEL_BYTES = 10 * 1024 * 1024;
export const LABEL_FILE_ACCEPT =
  ".pdf,.zpl,.txt,.jpg,.jpeg,.png,.webp,application/pdf,text/plain,image/jpeg,image/png,image/webp";

/**
 * The buyer's address from a shipping label file, read in the browser: the address never leaves
 * the reseller's machine. Text PDFs, ZPL and TXT are read directly; photos and scanned PDFs by OCR.
 */
export async function readLabelAddress(file: File): Promise<LabelAddress> {
  if (file.size > MAX_LABEL_BYTES) {
    throw validationError(
      `A etiqueta tem ${formatFileSize(file.size)}; o limite é ${formatFileSize(MAX_LABEL_BYTES)}.`,
    );
  }
  if (isPdf(file)) return readPdfAddress(file);
  if (isImage(file)) return parseShippingLabel(await recognizeText([await imageToCanvas(file)]));
  if (isTextFile(file)) {
    const text = await file.text();
    return parseShippingLabel(isZpl(text) ? zplToText(text) : text);
  }
  throw validationError(
    `O arquivo "${file.name}" não é aceito: envie a etiqueta em PDF, foto (JPG, PNG), ZPL ou TXT.`,
  );
}

async function readPdfAddress(file: File): Promise<LabelAddress> {
  const label = await readPdfLabel(file, hasPostalCode);
  if (label.kind === "text") return parseShippingLabel(label.text);
  return parseShippingLabel(await recognizeText(label.pages));
}

/** A label's text without a CEP is not the address block: the PDF is read as an image. */
function hasPostalCode(text: string): boolean {
  return parseShippingLabel(text).postalCode !== undefined;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isImage(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

function isTextFile(file: File): boolean {
  return file.type === "text/plain" || /\.(zpl|txt)$/i.test(file.name);
}
