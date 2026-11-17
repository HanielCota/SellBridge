import { PRODUCT_IMAGE_PATH } from "./product-image-key";

/**
 * Where a product photo came from, in the supplier's words: a photo sent from the device, or the
 * site of a pasted link. Never the whole address, which says nothing to a person.
 */
export function imageSourceLabel(url: string): string {
  if (!URL.canParse(url)) {
    return "Foto do produto";
  }
  const parsed = new URL(url);
  if (parsed.pathname.startsWith(`${PRODUCT_IMAGE_PATH}/`)) {
    return "Enviada do celular ou computador";
  }
  return `Link de ${parsed.hostname.replace(/^www\./, "")}`;
}
