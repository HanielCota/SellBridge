import { useMutation, useQuery } from "@tanstack/react-query";
import { AppError, isAppError } from "@sellbridge/shared/errors";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { assertImportableFile, fileToBase64 } from "./import-file";
import {
  supplierImportConfirm,
  supplierImportFiles,
  supplierImportPreview,
} from "./supplier-import.functions";

export interface ChosenFile {
  readonly name: string;
  readonly size: number;
}

/** Choosing a file previews it at once; importing is a separate, explicit step. */
export function useSupplierImport(supplierId: string) {
  const [file, setFile] = useState<ChosenFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const preview = useMutation({ mutationFn: supplierImportPreview });
  const apply = useMutation({ mutationFn: supplierImportConfirm });
  const files = useQuery({
    queryKey: ["supplier-panel", "import-files", supplierId],
    queryFn: async () => await supplierImportFiles({ data: { supplierId } }),
    staleTime: 5 * 60 * 1000,
  });

  function reset() {
    preview.reset();
    apply.reset();
    setFile(null);
    setFileError(null);
  }

  async function chooseFile(chosen: File | undefined) {
    reset();
    if (chosen === undefined) {
      return;
    }
    setFile({ name: chosen.name, size: chosen.size });
    try {
      assertImportableFile(chosen);
      const fileBase64 = await fileToBase64(chosen);
      preview.mutate({ data: { supplierId, fileName: chosen.name, fileBase64 } });
    } catch (error) {
      const failure = isAppError(error)
        ? error
        : new AppError("VALIDATION", "Não foi possível ler o arquivo", { cause: error });
      setFileError(errorMessage(failure));
    }
  }

  function confirm() {
    const confirmation = preview.data?.confirmation;
    if (confirmation === null || confirmation === undefined) {
      return;
    }
    apply.mutate({ data: { supplierId, ...confirmation } });
  }

  const previewError = preview.isError ? errorMessage(preview.error) : null;
  return {
    file,
    error: fileError ?? previewError,
    preview,
    apply,
    files,
    chooseFile,
    confirm,
    reset,
  };
}

export type SupplierImportState = ReturnType<typeof useSupplierImport>;
