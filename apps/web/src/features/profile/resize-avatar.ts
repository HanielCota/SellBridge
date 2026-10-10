const AVATAR_SIZE = 512;
/** Originals above this are refused before any work; phone photos are usually 2–8 MB. */
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem"))),
      "image/webp",
      0.9,
    );
  });
}

/**
 * Crops the center square and scales it to 512×512 WEBP in the browser, so a
 * phone photo uploads as ~50 KB and every avatar has the same shape.
 */
export async function resizeAvatar(file: File): Promise<Blob> {
  if (!(ACCEPTED_AVATAR_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPG ou WEBP");
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("A imagem deve ter no máximo 15 MB");
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("Não foi possível ler esta imagem");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Seu navegador não conseguiu processar a imagem");
  }
  context.imageSmoothingQuality = "high";
  const sourceX = (bitmap.width - side) / 2;
  const sourceY = (bitmap.height - side) / 2;
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return canvasToBlob(canvas);
}
