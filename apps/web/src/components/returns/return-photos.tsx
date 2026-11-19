import type { ReturnPhotoView } from "@sellbridge/database/repositories";
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS } from "@sellbridge/shared/schemas";
import { CameraIcon, FilePdfIcon } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { AttachmentThumbnails } from "@/components/support/attachment-thumbnails";
import { Button } from "@/components/ui/button";
import {
  selectAttachments,
  type RejectedAttachment,
} from "@/features/support/attachment-selection";

const PHOTO_SIZE_PX = 96;

function photoUrl(photo: ReturnPhotoView, inline: boolean): string {
  return `/api/devolucoes/fotos/${photo.id}${inline ? "?inline=1" : ""}`;
}

/** Photos already sent on a return, opened full size in a new tab. */
export function ReturnPhotoList({
  photos,
  label,
}: {
  photos: readonly ReturnPhotoView[];
  label: string;
}) {
  if (photos.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a
            href={photoUrl(photo, true)}
            target="_blank"
            rel="noreferrer"
            className="block size-24 overflow-hidden rounded-xl border border-border bg-muted focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:outline-none"
          >
            {photo.mimeType.startsWith("image/") ? (
              <img
                src={photoUrl(photo, true)}
                alt={`${label}, foto ${index + 1}`}
                width={PHOTO_SIZE_PX}
                height={PHOTO_SIZE_PX}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full flex-col items-center justify-center gap-1 text-footnote text-muted-foreground">
                <FilePdfIcon className="size-7" aria-hidden="true" />
                PDF {index + 1}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Photos picked for a form, checked on the spot; the server checks them again. */
export function useReturnPhotoPicker() {
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<RejectedAttachment[]>([]);
  return {
    files,
    rejected,
    add: (added: readonly File[]) => {
      const selection = selectAttachments(files, added);
      setFiles([...files, ...selection.accepted]);
      setRejected(selection.rejected);
    },
    remove: (index: number) => {
      setFiles(files.toSpliced(index, 1));
      setRejected([]);
    },
  };
}

function RejectedPhotos({ rejected }: { rejected: readonly RejectedAttachment[] }) {
  if (rejected.length === 0) {
    return null;
  }
  return (
    <ul role="alert" className="grid gap-1 text-sm text-destructive">
      {rejected.map((item, index) => (
        <li key={`${item.name}-${index}`}>
          <span className="font-medium">{item.name}</span>: {item.reason}
        </li>
      ))}
    </ul>
  );
}

function PickPhotosButton({ picker }: { picker: ReturnType<typeof useReturnPhotoPicker> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => {
          const added = Array.from(event.target.files ?? []);
          // Clears the input so picking the same file again still fires onChange.
          if (inputRef.current !== null) {
            inputRef.current.value = "";
          }
          picker.add(added);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={picker.files.length >= MAX_ATTACHMENTS}
        onClick={() => inputRef.current?.click()}
      >
        <CameraIcon aria-hidden="true" />
        Escolher fotos
      </Button>
      <p className="mt-1.5 text-footnote text-muted-foreground">
        Até {MAX_ATTACHMENTS} fotos ou PDFs, de até 5 MB cada.
      </p>
    </div>
  );
}

/** "Fotos do produto": a camera-friendly picker with thumbnails and a reason per refused file. */
export function ReturnPhotoPicker({
  picker,
  label,
  hint,
  required,
}: {
  picker: ReturnType<typeof useReturnPhotoPicker>;
  label: string;
  hint: string;
  required: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <div>
        <h4 id={headingId} className="text-sm font-medium">
          {label}{" "}
          <span className="font-normal text-muted-foreground">
            {required ? "(obrigatório)" : "(opcional)"}
          </span>
        </h4>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <AttachmentThumbnails files={picker.files} onRemove={picker.remove} />
      <RejectedPhotos rejected={picker.rejected} />
      <PickPhotosButton picker={picker} />
    </section>
  );
}

/** The form's files under the name the server reads them by. */
export function appendPhotos(formData: FormData, files: readonly File[]): void {
  for (const file of files) {
    formData.append("files", file);
  }
}
