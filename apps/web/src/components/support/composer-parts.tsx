import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
} from "@sellbridge/shared/schemas";
import { PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatBytes, validateSelection } from "@/components/support/attachment-input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/*
 * Shared pieces of the ticket composers (support and reseller): one rounded box holding the
 * text, the picked files and a row of icon actions, so both sides of a ticket look alike.
 */

export const COMPOSER_BOX_CLASS =
  "space-y-1 rounded-3xl border border-field-border bg-field p-2 transition-colors focus-within:border-brand-strong";

/** Text inset (8px box + 12px field) matches the 20px padding of the cards around it. */
export const COMPOSER_TEXTAREA_CLASS =
  "field-sizing-content max-h-80 min-h-20 w-full resize-none bg-transparent px-3 py-2.5 text-subhead leading-relaxed outline-none placeholder:text-muted-foreground";

export const COMPOSER_TOOLBAR_CLASS =
  "flex items-center gap-0.5 border-t border-border/60 px-1 pt-2";

const ATTACHMENT_HINT = `Anexar até ${MAX_ATTACHMENTS} arquivos PNG, JPG, WEBP ou PDF (${formatBytes(MAX_ATTACHMENT_BYTES)} cada)`;

/** Ctrl/Cmd + Enter sends, as in most chat and mail apps. */
export function submitOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>, onSubmit: () => void) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
    return;
  }
  event.preventDefault();
  onSubmit();
}

/** Files picked for the message, checked on the client before they are kept. */
export function useComposerFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  function addFiles(added: File[]) {
    const problem = validateSelection(files, added);
    setFileError(problem);
    if (problem) {
      return;
    }
    setFiles([...files, ...added]);
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, position) => position !== index));
  }

  function clear() {
    setFiles([]);
    setFileError(null);
  }

  return { files, fileError, addFiles, removeFile, clear };
}

/** Icon-only button whose name shows in a tooltip and doubles as the accessible name. */
export function IconAction({
  label,
  pressed,
  className,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AttachmentButton({ onAdd }: { onAdd: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Anexos"
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const added = Array.from(event.target.files ?? []);
          // Clears the native input so picking the same file again still fires onChange.
          if (inputRef.current) {
            inputRef.current.value = "";
          }
          onAdd(added);
        }}
      />
      <IconAction label={ATTACHMENT_HINT} onClick={() => inputRef.current?.click()}>
        <PaperclipIcon aria-hidden="true" />
      </IconAction>
    </>
  );
}

export function AttachedFiles({
  files,
  onRemove,
}: {
  files: readonly File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-1.5 px-3 pb-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-2.5 text-xs"
        >
          <span className="truncate">{file.name}</span>
          <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5"
            aria-label={`Remover ${file.name}`}
            onClick={() => onRemove(index)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function FileError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return <p className="px-4 text-sm text-destructive">{message}</p>;
}
