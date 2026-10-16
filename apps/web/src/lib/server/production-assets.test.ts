import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productionStaticFiles, retainAssets } from "./production-assets";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function release(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sellbridge-assets-"));
  directories.push(directory);
  await mkdir(join(directory, "assets"));
  for (const [name, contents] of Object.entries(files))
    await writeFile(join(directory, "assets", name), contents);
  return directory;
}

describe("production assets across rolling deploys", () => {
  it("serves modules from the previous release after its container is removed", async () => {
    const previous = await release({
      "old-111.js": 'import "./shared-111.js";',
      "shared-111.js": "export const value = 1;",
    });
    const current = await release({ "new-222.js": "export const value = 2;" });
    const archive = await release({});
    await retainAssets(previous, archive);
    await rm(previous, { recursive: true });
    await retainAssets(current, archive);
    const middleware = productionStaticFiles(current, archive);
    const next = vi.fn<() => Response>(() => new Response("SSR HTML"));
    for (const filename of ["old-111.js", "shared-111.js", "new-222.js"]) {
      const response = await middleware(
        new Request(`https://app.example/assets/${filename}`),
        next,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      expect(response.headers.get("cache-control")).toContain("immutable");
      expect(await response.text()).toMatch(/import|export/);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("publishes atomically and preserves existing files when two containers start together", async () => {
    const current = await release({ "same-111.js": "complete module" });
    const archive = await release({ "same-111.js": "existing immutable module" });
    await Promise.all([retainAssets(current, archive), retainAssets(current, archive)]);
    expect(await readFile(join(archive, "assets", "same-111.js"), "utf8")).toBe(
      "existing immutable module",
    );
    expect(await readdir(join(archive, "assets"))).toEqual(["same-111.js"]);
  });

  it("never returns an SSR page for a missing asset or exposes unrelated archived files", async () => {
    const current = await release({});
    const archive = await release({});
    await writeFile(join(archive, "private.txt"), "not public");
    const middleware = productionStaticFiles(current, archive);
    const next = vi.fn<() => Response>(() => new Response("SSR HTML"));
    const missing = await middleware(new Request("https://app.example/assets/missing.js"), next);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.text()).toBe("Asset not found");
    expect(next).not.toHaveBeenCalled();
    const unrelated = await middleware(new Request("https://app.example/private.txt"), next);
    expect(await unrelated.text()).toBe("SSR HTML");
  });
});
