import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

const sourceRoot = join(import.meta.dirname, "..", "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/** The opening tag around each `aria-label="Carregando…"`, with the file it is in. */
function loadingTags(): { file: string; tag: string }[] {
  return sourceFiles(sourceRoot).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(/aria-label="Carregando[^"]*"/g)].map((match) => {
      const start = text.lastIndexOf("<", match.index);
      const end = text.indexOf(">", match.index);
      return { file: relative(sourceRoot, file), tag: text.slice(start, end + 1) };
    });
  });
}

describe("loading placeholders", () => {
  // Regression: axe flags aria-label on a plain div (aria-prohibited-attr), so every page that
  // was scanned while still loading failed the accessibility check.
  it("give each labelled loading placeholder a role, so its label is announced", () => {
    const tags = loadingTags();
    expect(tags.length).toBeGreaterThan(0);
    const unlabelled = tags.filter(
      // <output> is a status region by itself; a Skeleton turns into one when labelled.
      ({ tag }) => !/^<(?:output|Skeleton)\s/.test(tag) && !/\srole="/.test(tag),
    );
    expect(unlabelled).toEqual([]);
  });

  it("makes a labelled Skeleton a status region, and leaves a bare one silent", () => {
    expect(Skeleton({ "aria-label": "Carregando pedidos" }).props.role).toBe("status");
    expect(Skeleton({}).props.role).toBeUndefined();
  });
});
