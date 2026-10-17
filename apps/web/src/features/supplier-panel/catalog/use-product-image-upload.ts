import { useState } from "react";
import { z } from "zod";
import { postMultipart } from "@/features/support/upload";
import { errorMessage } from "@/lib/errors";

const uploadedImageSchema = z.object({ url: z.url() });

async function uploadProductImage(supplierId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.set("supplierId", supplierId);
  formData.set("file", file);
  const body = await postMultipart("/api/fornecedor/produtos/imagens", formData);
  const parsed = uploadedImageSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("O servidor não devolveu o link da imagem. Tente de novo.");
  }
  return parsed.data.url;
}

function failedFileLabel(sent: number, total: number): string {
  return total === 1 ? "A imagem não foi enviada" : `Imagem ${sent + 1} de ${total} não enviada`;
}

/**
 * Sends photos picked on the phone or computer, one at a time and in the order picked, and
 * hands back the links of the ones that arrived. A file that fails stops the rest and says why.
 */
export function useProductImageUpload(supplierId: string) {
  const [sending, setSending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: readonly File[]): Promise<string[]> {
    setError(null);
    const urls: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setSending(files.length - index);
        urls.push(await uploadProductImage(supplierId, file));
      }
    } catch (failure) {
      setError(`${failedFileLabel(urls.length, files.length)}: ${errorMessage(failure)}`);
    } finally {
      setSending(0);
    }
    return urls;
  }

  return { upload, sending, error };
}
