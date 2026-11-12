import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchLabelsReport, LabelFile } from "@/features/supplier-panel/orders/batch-labels";

const MEDIA_TYPES = { pdf: "application/pdf", zpl: "text/plain" } as const;

/** One store's labels as a local link: the PDF opens to print, the ZPL downloads. */
function fileUrl(file: LabelFile): string {
  const bytes = Uint8Array.from(atob(file.contentBase64), (character) => character.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: MEDIA_TYPES[file.format] }));
}

/** "etiquetas-zebra-loja-centro.txt": the store in the name, so two downloads never mix up. */
export function zplFileName(storeName: string): string {
  const slug = storeName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "etiquetas-zebra.txt" : `etiquetas-zebra-${slug}.txt`;
}

function LabelFileLink({ file, url }: { file: LabelFile; url: string }) {
  if (file.format === "zpl") {
    return (
      <Button asChild size="sm">
        <a href={url} download={zplFileName(file.storeName)}>
          Baixar etiquetas Zebra · {file.storeName} ({file.labelCount})
        </a>
      </Button>
    );
  }
  return (
    <Button asChild size="sm">
      <a href={url} target="_blank" rel="noopener noreferrer">
        Abrir etiquetas · {file.storeName} ({file.labelCount})
      </a>
    </Button>
  );
}

/** One link per reseller store's file, freed when the result closes. */
function useLabelLinks(files: readonly LabelFile[]) {
  const links = useMemo(() => files.map((file) => ({ file, url: fileUrl(file) })), [files]);
  useEffect(
    () => () => {
      for (const link of links) {
        URL.revokeObjectURL(link.url);
      }
    },
    [links],
  );
  return links;
}

/**
 * After a batch print: one file per reseller store to open or download, and, for each order whose
 * label did not come, the reason ("not released yet" is the most common).
 */
export function BatchLabelsResult({
  report,
  orderNumbers,
  onDismiss,
}: {
  report: BatchLabelsReport;
  orderNumbers: ReadonlyMap<string, string>;
  onDismiss: () => void;
}) {
  const links = useLabelLinks(report.files);
  const failures = report.results.flatMap((result) => (result.printed ? [] : [result]));
  const allPrinted = failures.length === 0;
  const Icon = allPrinted ? CheckCircleIcon : XCircleIcon;
  return (
    <output className="block">
      <Alert variant={allPrinted ? "default" : "destructive"}>
        <Icon aria-hidden="true" />
        <AlertTitle>
          {report.printedCount}{" "}
          {report.printedCount === 1 ? "etiqueta pronta" : "etiquetas prontas"}
          {allPrinted
            ? ""
            : `, ${report.failedCount} não ${report.failedCount === 1 ? "veio" : "vieram"}`}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          {links.length === 0 ? null : (
            <ul className="flex flex-wrap gap-2">
              {links.map((link) => (
                <li key={link.url}>
                  <LabelFileLink file={link.file} url={link.url} />
                </li>
              ))}
            </ul>
          )}
          {links.some((link) => link.file.format === "zpl") ? (
            <p>
              Abra o arquivo no programa da sua impressora Zebra, como faz com a etiqueta baixada no
              Mercado Livre.
            </p>
          ) : null}
          {failures.length === 0 ? null : (
            <ul className="space-y-1">
              {failures.map((failure) => (
                <li key={failure.shipmentId}>
                  <span className="font-medium">
                    Pedido {orderNumbers.get(failure.shipmentId) ?? failure.shipmentId}:
                  </span>{" "}
                  {failure.reason}
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Fechar
          </Button>
        </AlertDescription>
      </Alert>
    </output>
  );
}
