import { randomUUID } from "node:crypto";
import type { NewAttachment } from "@sellbridge/db/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { detectAttachmentType, sanitizeFileName } from "@sellbridge/shared/file-signature";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "@sellbridge/shared/schemas";
import type { FileStorage } from "@/lib/server/storage";

export interface ValidatedFile {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

function filesFrom(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

/** Validates count, size and the real file type (magic bytes) of uploaded attachments. */
export async function validateAttachments(formData: FormData): Promise<ValidatedFile[]> {
  const files = filesFrom(formData);
  if (files.length > MAX_ATTACHMENTS) {
    throw validationError(`Envie no máximo ${MAX_ATTACHMENTS} anexos`);
  }
  const validated: ValidatedFile[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw validationError(`"${file.name}" excede o limite de 5 MB`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = detectAttachmentType(bytes);
    if (!mimeType) {
      throw validationError(`"${file.name}" não é um formato aceito (PNG, JPG, WEBP ou PDF)`);
    }
    validated.push({
      bytes,
      fileName: sanitizeFileName(file.name),
      mimeType,
      sizeBytes: file.size,
    });
  }
  return validated;
}

export async function storeAttachments(
  storage: FileStorage,
  tenantId: string,
  files: readonly ValidatedFile[],
): Promise<NewAttachment[]> {
  const stored: NewAttachment[] = [];
  for (const file of files) {
    const storageKey = `tickets/${tenantId}/${randomUUID()}-${file.fileName}`;
    await storage.put(storageKey, file.bytes);
    stored.push({
      storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
  }
  return stored;
}

export function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
