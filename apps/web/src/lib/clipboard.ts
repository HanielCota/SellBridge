import { toast } from "sonner";

/**
 * Copies `text`, toasting `successMessage` when given. Returns whether it worked, so a button can
 * confirm in place instead. The clipboard API fails without permission or outside HTTPS, and
 * then the person needs to know to copy by hand.
 */
export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    return false;
  }
  if (successMessage !== undefined) {
    toast.success(successMessage);
  }
  return true;
}
