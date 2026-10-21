import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from "@sellbridge/shared/schemas";

/*
 * Client-side checks on picked files, for quick feedback in plain words; the server validates
 * again (including magic bytes). Each file is judged on its own: one bad file no longer throws
 * away the good ones picked with it.
 */

export interface RejectedAttachment {
  name: string;
  reason: string;
}

export interface AttachmentSelection {
  accepted: File[];
  rejected: RejectedAttachment[];
}

const ALLOWED_TYPES: ReadonlySet<string> = new Set(ALLOWED_ATTACHMENT_TYPES);
/** Some systems leave `type` empty; the extension then tells what the file is. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};
/** iPhone photos: browsers cannot show them, so they get their own way out. */
const APPLE_PHOTO = /\.(heic|heif)$/i;

function extensionOf(name: string): string {
  return name.split(".").at(-1)?.toLowerCase() ?? "";
}

export function attachmentType(file: File): string {
  if (file.type !== "") {
    return file.type;
  }
  return TYPE_BY_EXTENSION[extensionOf(file.name)] ?? "";
}

function sameFile(left: File, right: File): boolean {
  return (
    left.name === right.name && left.size === right.size && left.lastModified === right.lastModified
  );
}

function rejectionReason(file: File, kept: readonly File[]): string | null {
  if (kept.some((other) => sameFile(other, file))) {
    return "Esse arquivo já está na lista.";
  }
  if (APPLE_PHOTO.test(file.name) || file.type === "image/heic" || file.type === "image/heif") {
    return "Essa foto não pôde ser enviada. Tire um print dela e envie o print.";
  }
  if (!ALLOWED_TYPES.has(attachmentType(file))) {
    return "Esse tipo de arquivo não é aceito. Envie um print, uma foto ou um PDF.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "Esse arquivo é grande demais. Envie um print em vez da foto.";
  }
  if (kept.length >= MAX_ATTACHMENTS) {
    return `Já tem ${MAX_ATTACHMENTS} arquivos. Remova um para trocar.`;
  }
  return null;
}

/** Splits the files just picked into the ones kept (after the current ones) and the refused. */
export function selectAttachments(current: readonly File[], added: readonly File[]) {
  return added.reduce<AttachmentSelection>(
    (selection, file) => {
      const kept = [...current, ...selection.accepted];
      const reason = rejectionReason(file, kept);
      if (reason === null) {
        return { ...selection, accepted: [...selection.accepted, file] };
      }
      return { ...selection, rejected: [...selection.rejected, { name: file.name, reason }] };
    },
    { accepted: [], rejected: [] },
  );
}

/** One line for places that show a single message: "foto.heic: Essa foto não pôde…". */
export function rejectionSummary(rejected: readonly RejectedAttachment[]): string | null {
  if (rejected.length === 0) {
    return null;
  }
  return rejected.map((item) => `${item.name}: ${item.reason}`).join(" ");
}
