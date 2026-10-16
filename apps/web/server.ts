import { fileURLToPath } from "node:url";
import { serve } from "srvx";
import { productionStaticFiles, retainAssets } from "./src/lib/server/production-assets.ts";
import { limitRequestBody } from "./src/lib/server/request-body-limit.ts";

const clientDirectory = fileURLToPath(new URL("./dist/client/", import.meta.url));
const archiveDirectory =
  process.env.WEB_ASSETS_DIR ?? fileURLToPath(new URL("./.web-assets/", import.meta.url));
await retainAssets(clientDirectory, archiveDirectory);
const port = Number(process.env.PORT ?? 3000);
// "abc" or 70000 would make the server listen on a random or invalid port without a word.
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`PORT inválida: ${process.env.PORT}`);
}
const serverEntry = new URL("./dist/server/server.js", import.meta.url);
const { default: app } = await import(serverEntry.href);
const server = serve({
  // Server functions and auth parse whole bodies; the cap is applied while the bytes arrive.
  fetch: (request: Request) => {
    const limited = limitRequestBody(request);
    return limited instanceof Response ? limited : app.fetch(limited);
  },
  middleware: [productionStaticFiles(clientDirectory, archiveDirectory)],
  hostname: process.env.HOST ?? "0.0.0.0",
  port,
  gracefulShutdown: true,
});
await server.ready();
