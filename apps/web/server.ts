import { fileURLToPath } from "node:url";
import { serve } from "srvx";
import { productionStaticFiles, retainAssets } from "./src/lib/server/production-assets.ts";

const clientDirectory = fileURLToPath(new URL("./dist/client/", import.meta.url));
const archiveDirectory =
  process.env.WEB_ASSETS_DIR ?? fileURLToPath(new URL("./.web-assets/", import.meta.url));
await retainAssets(clientDirectory, archiveDirectory);
const serverEntry = new URL("./dist/server/server.js", import.meta.url);
const { default: app } = await import(serverEntry.href);
const server = serve({
  fetch: app.fetch,
  middleware: [productionStaticFiles(clientDirectory, archiveDirectory)],
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  gracefulShutdown: true,
});
await server.ready();
