import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Tesseract fetches its language model as `<directory>/por.traineddata.gz`, so the file needs a
 * fixed name instead of a hashed asset. The directory carries the data package version.
 */
const OCR_MODEL_DIRECTORY = "ocr/por-1.0.0";
const OCR_MODEL_FILE = "por.traineddata.gz";

/** Serves the Portuguese OCR model from its npm package in dev and copies it into the build. */
function ocrModel(): Plugin {
  const source = createRequire(import.meta.url).resolve(
    `@tesseract.js-data/por/4.0.0_best_int/${OCR_MODEL_FILE}`,
  );
  return {
    name: "sellbridge-ocr-model",
    configureServer(server) {
      server.middlewares.use(
        `/${OCR_MODEL_DIRECTORY}/${OCR_MODEL_FILE}`,
        async (_request, response) => {
          response.setHeader("content-type", "application/octet-stream");
          response.end(await readFile(source));
        },
      );
    },
    async generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: `${OCR_MODEL_DIRECTORY}/${OCR_MODEL_FILE}`,
        source: await readFile(source),
      });
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(
      process.env.VITE_BUILD_ID ?? process.env.SOURCE_COMMIT ?? "development",
    ),
    "import.meta.env.VITE_OCR_MODEL_DIRECTORY": JSON.stringify(`/${OCR_MODEL_DIRECTORY}`),
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        codeSplittingOptions: {
          // Load each page's queries with its loader instead of importing every feature at boot.
          defaultBehavior: [
            ["loader"],
            ["component"],
            ["pendingComponent"],
            ["errorComponent"],
            ["notFoundComponent"],
          ],
        },
      },
    }),
    viteReact(),
    ocrModel(),
  ],
});
