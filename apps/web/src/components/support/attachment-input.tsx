import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS } from "@sellbridge/shared/schemas";
import { PaperclipIcon } from "@phosphor-icons/react";
import { useId, useRef } from "react";
import { AttachmentThumbnails } from "@/components/support/attachment-thumbnails";
import { useFileDrop } from "@/components/support/composer-parts";
import { Button } from "@/components/ui/button";
import type { RejectedAttachment } from "@/features/support/attachment-selection";
import { cn } from "@/lib/utils";

interface AttachmentInputProps {
  files: readonly File[];
  rejected: readonly RejectedAttachment[];
  /** What helps most for the situation picked ("Um print da tela de rastreio."). */
  tip: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

/** "Um print da tela." read after a colon: "um print da tela." */
function sentenceTail(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function RejectedFiles({ rejected }: { rejected: readonly RejectedAttachment[] }) {
  if (rejected.length === 0) {
    return null;
  }
  return (
    <ul role="alert" className="grid gap-1 text-sm text-destructive">
      {rejected.map((item) => (
        <li key={item.name}>
          <span className="font-medium">{item.name}</span>: {item.reason}
        </li>
      ))}
    </ul>
  );
}

/** Prints, photos and PDFs for a new ticket: thumbnails, a reason per refused file, drag and drop. */
export function AttachmentInput({ files, rejected, tip, onAdd, onRemove }: AttachmentInputProps) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const drop = useFileDrop(onAdd);

  function handleSelection(selected: FileList | null) {
    const added = Array.from(selected ?? []);
    // Clears the native input so picking the same file again still fires onChange.
    if (inputRef.current !== null) {
      inputRef.current.value = "";
    }
    onAdd(added);
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "-m-2 grid gap-2.5 rounded-2xl p-2 transition-colors",
        drop.isOver && "bg-brand/5 outline-2 outline-brand-strong outline-dashed",
      )}
      {...drop.handlers}
    >
      <div>
        <h3 id={headingId} className="text-sm font-medium">
          Quer mandar um print ou foto?{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </h3>
        {tip === null ? null : (
          <p className="text-sm text-muted-foreground">O que mais ajuda: {sentenceTail(tip)}</p>
        )}
      </div>
      <AttachmentThumbnails files={files} onRemove={onRemove} />
      <RejectedFiles rejected={rejected} />
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        // Listing the exact types makes iPhones convert their HEIC photos to JPEG on the way out.
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => handleSelection(event.target.files)}
      />
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <PaperclipIcon aria-hidden="true" />
          Escolher print ou foto
        </Button>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Até {MAX_ATTACHMENTS} prints, fotos ou PDFs
          <span className="hidden sm:inline">. Você também pode arrastar o print para cá</span>.
        </p>
      </div>
    </section>
  );
}
