import { FileArrowUpIcon, FileCsvIcon, FileXlsIcon } from "@phosphor-icons/react";
import { SUPPLIER_IMPORT_ACCEPT } from "@sellbridge/shared/supplier-panel-import-schemas";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChosenFile } from "@/features/supplier-panel/import/use-supplier-import";

const sizeFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${sizeFormat.format(Math.max(bytes / 1024, 0.1))} KB`;
  }
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

interface ImportDropZoneProps {
  file: ChosenFile | null;
  busy: boolean;
  onChoose: (file: File | undefined) => void;
}

function FileKindIcon({ file }: { file: ChosenFile | null }) {
  const props = { className: "size-6", weight: "light", "aria-hidden": true } as const;
  if (file === null) {
    return <FileArrowUpIcon {...props} />;
  }
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    return <FileXlsIcon {...props} />;
  }
  return <FileCsvIcon {...props} />;
}

function DropZoneText({ file, busy }: { file: ChosenFile | null; busy: boolean }) {
  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-card text-muted-foreground">
        <FileKindIcon file={file} />
      </span>
      <div className="max-w-md space-y-1">
        <p className="text-subhead font-medium">
          {file === null ? "Arraste a planilha de produtos para cá" : file.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {file === null
            ? "Excel (.xlsx) ou CSV com ponto e vírgula, vírgula ou tabulação. Até 2 MB e 1.000 produtos."
            : `${fileSizeLabel(file.size)} · ${busy ? "conferindo cada linha…" : "solte outro arquivo para trocar"}`}
        </p>
      </div>
    </>
  );
}

/**
 * Drag a spreadsheet here or pick it. The whole area is the drop target; the button is the
 * keyboard and touch path, since phones have no drag and drop.
 */
export function ImportDropZone({ file, busy, onChoose }: ImportDropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) {
      return;
    }
    onChoose(event.dataTransfer.files[0]);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      aria-busy={busy}
      className={cn(
        "flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-field-border bg-surface-grouped px-6 py-10 text-center transition-colors motion-reduce:transition-none sm:py-14",
        dragging && "border-brand bg-brand/5",
      )}
    >
      <DropZoneText file={file} busy={busy} />
      <input
        ref={input}
        type="file"
        accept={SUPPLIER_IMPORT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={busy}
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          // Cleared so choosing the same file again (after fixing it) still fires a change.
          if (input.current !== null) input.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <FileArrowUpIcon aria-hidden="true" />
        {file === null ? "Escolher arquivo" : "Escolher outro arquivo"}
      </Button>
    </div>
  );
}
