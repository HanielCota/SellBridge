import { FilePdfIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { attachmentType } from "@/features/support/attachment-selection";
import { formatFileSize } from "@/lib/file-size";

/**
 * The picked image as a data address. Read once per file; nothing to release afterwards, unlike
 * an object URL, which a double-run effect would revoke while the thumbnail still shows it.
 */
function useImagePreview(file: File): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        setPreview({ file, url: reader.result });
      }
    });
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file]);
  return preview?.file === file ? preview.url : null;
}

function ImagePreview({ file }: { file: File }) {
  const url = useImagePreview(file);
  if (url === null) {
    return <div className="size-full bg-muted" />;
  }
  // Contained, never cropped: a tall phone print must still be recognisable.
  return <img src={url} alt="" className="size-full object-contain" />;
}

function FilePreview({ file }: { file: File }) {
  if (attachmentType(file).startsWith("image/")) {
    return <ImagePreview file={file} />;
  }
  return (
    <div className="flex size-full items-center justify-center text-muted-foreground">
      <FilePdfIcon className="size-7" aria-hidden="true" />
    </div>
  );
}

/** The files about to be sent, as thumbnails, so the customer can tell they picked the right ones. */
export function AttachmentThumbnails({
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
    <ul className="flex flex-wrap gap-2" aria-label="Arquivos escolhidos">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.lastModified}-${file.size}`}
          className="w-32 overflow-hidden rounded-2xl border bg-card"
        >
          <div className="h-20 bg-muted">
            <FilePreview file={file} />
          </div>
          <div className="flex items-center gap-1 py-1 pr-1 pl-2.5">
            <span className="min-w-0 flex-1 text-xs">
              <span className="block truncate">{file.name}</span>
              <span className="block text-muted-foreground">{formatFileSize(file.size)}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground sm:size-8"
              aria-label={`Remover ${file.name}`}
              onClick={() => onRemove(index)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
