import { validationError } from "@sellbridge/shared/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { downloadBlob, downloadCsv } from "./import-file";
import {
  fileNameFromDisposition,
  type ProductExportFilters,
  productExportHref,
} from "./product-export-file";
import { supplierImportFilesQueryOptions } from "./supplier-import.queries";

/** A big catalog streams for a while; past this the browser gives up and says so. */
const EXPORT_TIMEOUT_MS = 120_000;
const TEMPLATE_FILE_NAME = "modelo-produtos.csv";
/** Refusals the export words for the supplier (no session, another profile, no brand yet). */
const WORDED_REFUSALS = new Set([401, 403, 422]);

/** The server's own wording for a refusal; anything else gets a plain retry message. */
async function refusalOf(response: Response): Promise<Error> {
  const text = (await response.text()).trim();
  if (WORDED_REFUSALS.has(response.status) && text !== "") {
    return validationError(text);
  }
  return new Error("Não foi possível montar a planilha. Tente de novo.");
}

/**
 * "Baixar produtos" and "Baixar planilha modelo": each click answers at once ("Preparando..."),
 * then says the file arrived or why not. A second click while one runs does nothing.
 */
export function useProductSpreadsheet(supplierId: string) {
  const withProfile = useTabProfileLink();
  const queryClient = useQueryClient();
  const running = useRef(false);
  const [isExporting, setIsExporting] = useState(false);

  async function runOnce(loading: string, work: () => Promise<string>) {
    if (running.current) {
      return;
    }
    running.current = true;
    setIsExporting(true);
    const toastId = toast.loading(loading);
    try {
      const done = await work();
      toast.success(done, { id: toastId });
    } catch (error) {
      toast.error(errorMessage(error), { id: toastId });
    } finally {
      running.current = false;
      setIsExporting(false);
    }
  }

  function exportProducts(filters: ProductExportFilters) {
    void runOnce("Preparando a planilha dos produtos...", async () => {
      const response = await fetch(withProfile(productExportHref(filters)), {
        signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw await refusalOf(response);
      }
      const fileName = fileNameFromDisposition(response.headers.get("content-disposition"));
      downloadBlob(fileName, await response.blob());
      return `Planilha baixada: ${fileName}`;
    });
  }

  function downloadTemplate() {
    void runOnce("Preparando a planilha modelo...", async () => {
      const files = await queryClient.fetchQuery(supplierImportFilesQueryOptions(supplierId));
      downloadCsv(TEMPLATE_FILE_NAME, files.templateCsv);
      return `Planilha modelo baixada: ${TEMPLATE_FILE_NAME}`;
    });
  }

  return { isExporting, exportProducts, downloadTemplate };
}
