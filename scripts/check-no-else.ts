import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { findElseKeywords } from "./no-else-scanner.ts";

const ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|jsx)$/;
const IGNORED_DIRS = new Set(["node_modules", "dist", ".output", ".tanstack", "migrations"]);
const GENERATED_FILES = /(routeTree\.gen\.ts|\.d\.ts)$/;

async function* walk(directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    yield fullPath;
  }
}

function isCheckedSource(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized.includes("/src/")) {
    return false;
  }
  if (GENERATED_FILES.test(normalized)) {
    return false;
  }
  if (normalized.includes("/components/ui/")) {
    return false;
  }
  return SOURCE_EXTENSIONS.test(normalized);
}

async function collectSourceFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const root of ROOTS) {
    for await (const path of walk(root)) {
      if (isCheckedSource(path)) {
        files.push(path);
      }
    }
  }
  return files;
}

async function main(): Promise<void> {
  const files = await collectSourceFiles();
  let violationCount = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const violation of findElseKeywords(source)) {
      violationCount += 1;
      console.error(
        `${relative(".", file)}:${violation.line}:${violation.column}  uso de "else" proibido`,
      );
    }
  }
  if (violationCount > 0) {
    console.error(`\n${violationCount} ocorrência(s) de "else" encontradas. Use early return.`);
    process.exit(1);
  }
  console.log(`check:no-else ok (${files.length} arquivos verificados)`);
}

await main();
