import { randomUUID } from "node:crypto";
import { copyFile, link, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "srvx/static";
import type { ServerMiddleware } from "srvx";

async function copyDirectory(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }
    if (!entry.isFile()) continue;
    const temporaryPath = join(destination, `.${randomUUID()}.tmp`);
    try {
      await copyFile(sourcePath, temporaryPath);
      await link(temporaryPath, destinationPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    } finally {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}

/** Publish complete files atomically, without replacing assets another container serves. */
export async function retainAssets(
  clientDirectory: string,
  archiveDirectory: string,
): Promise<void> {
  // Only generated assets are archived. User uploads and public HTML never enter this tree.
  await copyDirectory(join(clientDirectory, "assets"), join(archiveDirectory, "assets"));
}

export function productionStaticFiles(
  clientDirectory: string,
  archiveDirectory: string,
): ServerMiddleware {
  const current = serveStatic({ dir: clientDirectory });
  const archived = serveStatic({ dir: archiveDirectory });
  return async (request, next) => {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/assets/")) return current(request, next);
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    const response = await current(request, () =>
      archived(
        request,
        () =>
          new Response("Asset not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          }),
      ),
    );
    if (response.ok) response.headers.set("cache-control", "public, max-age=31536000, immutable");
    return response;
  };
}
