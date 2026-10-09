import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from "@sellbridge/shared/schemas";
import { PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AttachmentInputProps {
  files: File[];
  onChange: (files: File[]) => void;
  error: string | null;
  onError: (message: string | null) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Client-side checks for quick feedback; the server validates again (including magic bytes). */
function validateSelection(current: File[], added: File[]): string | null {
  if (current.length + added.length > MAX_ATTACHMENTS) {
    return `Envie no máximo ${MAX_ATTACHMENTS} anexos`;
  }
  const tooBig = added.find((file) => file.size > MAX_ATTACHMENT_BYTES);
  if (tooBig) {
    return `"${tooBig.name}" excede o limite de 5 MB`;
  }
  const allowed: readonly string[] = ALLOWED_ATTACHMENT_TYPES;
  const invalid = added.find((file) => !allowed.includes(file.type));
  if (invalid) {
    return `"${invalid.name}" não é um formato aceito (PNG, JPG, WEBP ou PDF)`;
  }
  return null;
}

interface AttachmentListProps {
  files: File[];
  onRemove: (index: number) => void;
}

function AttachmentList({ files, onRemove }: AttachmentListProps) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
        >
          <span className="truncate">{file.name}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {formatBytes(file.size)}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Remover ${file.name}`}
              onClick={() => onRemove(index)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AttachmentInput({ files, onChange, error, onError }: AttachmentInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelection(selected: FileList | null) {
    const added = Array.from(selected ?? []);
    // Clears the native input so picking the same file again still fires onChange.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    const problem = validateSelection(files, added);
    onError(problem);
    if (problem) {
      return;
    }
    onChange([...files, ...added]);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>Anexos (opcional)</Label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => handleSelection(event.target.files)}
      />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={files.length >= MAX_ATTACHMENTS}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon aria-hidden="true" />
          Adicionar arquivo
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Até {MAX_ATTACHMENTS} arquivos PNG, JPG, WEBP ou PDF, com no máximo 5 MB cada.
        </p>
      </div>
      <AttachmentList
        files={files}
        onRemove={(index) => onChange(files.filter((_, position) => position !== index))}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
