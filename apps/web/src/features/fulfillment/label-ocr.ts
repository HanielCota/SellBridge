import { AppError, validationError } from "@sellbridge/shared/errors";

/** Longest side a label image is read at: sharp enough for small print, still quick to read. */
export const OCR_IMAGE_SIDE = 2400;
/** A small screenshot is enlarged at most this much: more only blurs the letters. */
const MAX_UPSCALE = 2;
/** Script, engine and model download plus start-up, on a slow mobile connection. */
const STARTUP_TIMEOUT_MILLISECONDS = 60_000;
const OCR_MODEL_DIRECTORY = modelDirectory();
/** Per image: a phone photo of a label reads in a few seconds even on a slow laptop. */
const RECOGNITION_TIMEOUT_MILLISECONDS = 90_000;

function modelDirectory(): string {
  const directory: unknown = import.meta.env.VITE_OCR_MODEL_DIRECTORY;
  return typeof directory === "string" ? directory : "/ocr";
}

/** The size to draw an image at so its longest side is `OCR_IMAGE_SIDE`. */
export function scaledSize(width: number, height: number) {
  const longest = Math.max(width, height);
  if (longest <= 0) return { width: 0, height: 0 };
  const scale = Math.min(OCR_IMAGE_SIDE / longest, MAX_UPSCALE);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Draws a photo or screenshot on a canvas at the size OCR reads best. */
export async function imageToCanvas(image: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await decodeImage(image);
  try {
    const size = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (context === null) throw new AppError("CONFIGURATION", "Seu navegador não abriu a imagem.");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

async function decodeImage(image: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(image, { imageOrientation: "from-image" });
  } catch (error) {
    throw validationError("Não foi possível abrir esta imagem. Envie uma foto em JPG ou PNG.", [
      error instanceof Error ? error.name : "UnknownError",
    ]);
  }
}

/**
 * Reads the printed text of label images with Tesseract, in a worker in the browser. Its code and
 * the Portuguese model are served by the app itself: the buyer's address never leaves the page.
 */
export async function recognizeText(canvases: readonly HTMLCanvasElement[]): Promise<string> {
  const worker = await createOcrWorker();
  try {
    const texts: string[] = [];
    for (const canvas of canvases) {
      const result = await withTimeout(worker.recognize(canvas, { rotateAuto: true }), {
        milliseconds: RECOGNITION_TIMEOUT_MILLISECONDS,
        message: "A leitura da imagem demorou demais. Tente uma foto mais nítida.",
      });
      texts.push(result.data.text);
    }
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}

async function createOcrWorker() {
  // Loaded on demand: several megabytes that only this button needs.
  const [tesseract, workerScript, coreScript] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
  ]);
  const failure = startupFailure();
  // A model passed as data is broken in tesseract.js 6 and 7 (it joins the bytes into the language
  // name), so the worker downloads it from the fixed path vite.config.ts serves.
  const startup = tesseract.createWorker("por", tesseract.OEM.LSTM_ONLY, {
    workerPath: absoluteUrl(workerScript.default),
    corePath: absoluteUrl(coreScript.default),
    langPath: absoluteUrl(OCR_MODEL_DIRECTORY),
    // The versioned directory keys the browser cache: a new model is never read from an old entry.
    cachePath: OCR_MODEL_DIRECTORY,
    errorHandler: failure.fail,
  });
  return withTimeout(Promise.race([startup, failure.promise]), {
    milliseconds: STARTUP_TIMEOUT_MILLISECONDS,
    message: "O leitor de imagens demorou para carregar. Tente de novo.",
  });
}

/**
 * Tesseract leaves its start promise pending when the model fails to load and only reports the
 * error to `errorHandler`: this turns that report into a rejection the button can show.
 */
function startupFailure() {
  const rejections: Array<(reason: unknown) => void> = [];
  const promise = new Promise<never>((_, reject) => rejections.push(reject));
  const fail = (reason: unknown) => {
    const error = new AppError(
      "EXTERNAL_PROVIDER",
      "Não foi possível carregar o leitor de imagens.",
      {
        details: { retryable: true },
        cause: reason,
      },
    );
    rejections.forEach((reject) => reject(error));
  };
  return { promise, fail };
}

/** The worker loads scripts from a blob URL, where a path relative to the page means nothing. */
function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

async function withTimeout<Value>(
  work: Promise<Value>,
  limit: { milliseconds: number; message: string },
): Promise<Value> {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const timeout = new Promise<never>((_, reject) => {
    timers.push(setTimeout(() => reject(validationError(limit.message)), limit.milliseconds));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    timers.forEach(clearTimeout);
  }
}
