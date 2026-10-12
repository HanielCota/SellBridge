import { useMutation } from "@tanstack/react-query";
import { AppError, isAppError, validationError } from "@sellbridge/shared/errors";
import { MAX_PRODUCT_CSV_BYTES } from "@sellbridge/shared/schemas";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { adminConfirmProductCsv, adminPreviewProductCsv } from "./suppliers.functions";
import { useCatalogAction } from "./use-catalog-action";

export function useProductCsv(supplierId: string) {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const preview = useMutation({ mutationFn: adminPreviewProductCsv });
  const apply = useCatalogAction(adminConfirmProductCsv, "Importação concluída", () =>
    preview.reset(),
  );
  async function selectFile(file: File | undefined) {
    preview.reset();
    apply.reset();
    setContent("");
    setFileName(file?.name ?? "");
    setFileError(null);
    if (!file) {
      return;
    }
    setIsReading(true);
    try {
      if (file.size > MAX_PRODUCT_CSV_BYTES) {
        throw validationError("O arquivo CSV deve ter no máximo 2 MiB");
      }
      setContent(await file.text());
    } catch (error) {
      const failure = isAppError(error)
        ? error
        : new AppError("VALIDATION", "Não foi possível ler o arquivo CSV", { cause: error });
      setFileError(errorMessage(failure));
    } finally {
      setIsReading(false);
    }
  }
  function confirm() {
    if (!preview.data || preview.data.errors.length > 0) {
      return;
    }
    apply.mutate({ data: { supplierId, content, previewToken: preview.data.previewToken } });
  }
  return {
    fileName,
    fileError,
    isReading,
    preview,
    apply,
    selectFile,
    confirm,
    generatePreview: () => preview.mutate({ data: { supplierId, content } }),
    canPreview: content.length > 0,
  };
}
