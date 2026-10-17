import { validationError } from "@sellbridge/shared/errors";
import {
  detectAttachmentType,
  imageSize,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
} from "@sellbridge/shared/file-signature";
import { PRODUCT_IMAGE_TYPES, type ProductImageType } from "./product-image-key";

const pixelCount = new Intl.NumberFormat("pt-BR");

function isProductImageType(type: string | null): type is ProductImageType {
  return type !== null && type in PRODUCT_IMAGE_TYPES;
}

/**
 * The type of a photo the supplier sent, read from its bytes; refuses anything else with the
 * reason in pt-BR. A file that starts like an image but whose size cannot be read is broken, not
 * too large (it used to be refused as "grande demais").
 */
export function checkProductImageBytes(bytes: Uint8Array): ProductImageType {
  const type = detectAttachmentType(bytes);
  if (!isProductImageType(type)) {
    throw validationError("Envie uma imagem PNG, JPG ou WEBP");
  }
  const size = imageSize(bytes, type);
  if (size === null || size.width === 0 || size.height === 0) {
    throw validationError(
      `O arquivo não é uma imagem ${PRODUCT_IMAGE_TYPES[type].toUpperCase()} válida: ele está corrompido ou incompleto. Envie outra foto.`,
    );
  }
  const tooLarge =
    size.width > MAX_IMAGE_SIDE ||
    size.height > MAX_IMAGE_SIDE ||
    size.width * size.height > MAX_IMAGE_PIXELS;
  if (tooLarge) {
    throw validationError(
      `A imagem é grande demais (${pixelCount.format(size.width)} × ${pixelCount.format(size.height)} px): envie uma de até 64 megapixels e ${pixelCount.format(MAX_IMAGE_SIDE)} px por lado`,
    );
  }
  return type;
}
