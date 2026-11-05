import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchLabelsReport, LabelFile } from "@/features/supplier-panel/orders/batch-labels";

/** The PDF of one store as a link the browser opens in a new tab, ready to print. */
function pdfUrl(file: LabelFile): string {
  const bytes = Uint8Array.from(atob(file.pdfBase64), (character) => character.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/** One link per reseller store's PDF, freed when the result closes. */
function useLabelLinks(files: readonly LabelFile[]) {
  const links = useMemo(() => files.map((file) => ({ file, url: pdfUrl(file) })), [files]);
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
 * After a batch print: one PDF per reseller store to open and print, and, for each order whose
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
                  <Button asChild size="sm">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      Abrir etiquetas · {link.file.storeName} ({link.file.labelCount})
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
