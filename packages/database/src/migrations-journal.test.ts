import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/*
 * The drizzle migrator applies only migrations whose `when` is later than the last one applied,
 * so an entry merged with an older `when` than one already in production is skipped in silence.
 * These checks need no database: two branches that each add the next migration collide here,
 * and the second one has to be generated again (`pnpm database:generate`) on top of the first.
 */
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const journal = z
  .object({ entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })) })
  .parse(JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")));

/** Shipped with an older `when` than 0007; databases that skipped it are repaired since. */
const LEGACY_OUT_OF_ORDER_TAGS = new Set(["0008_public_api"]);

function indexPrefix(index: number): string {
  return String(index).padStart(4, "0");
}

describe("migrations journal", () => {
  it("numbers the entries in order, one per position, matching their tags", () => {
    const mismatched = journal.entries.filter(
      (entry, position) =>
        entry.idx !== position || !entry.tag.startsWith(`${indexPrefix(position)}_`),
    );

    expect(mismatched).toEqual([]);
  });

  it("gives every migration a later timestamp than all the ones before it", () => {
    const outOfOrder = journal.entries.filter((entry, position) => {
      if (position === 0 || LEGACY_OUT_OF_ORDER_TAGS.has(entry.tag)) {
        return false;
      }
      const latestBefore = Math.max(...journal.entries.slice(0, position).map((item) => item.when));
      return entry.when <= latestBefore;
    });

    expect(outOfOrder.map((entry) => entry.tag)).toEqual([]);
  });

  it("has an SQL file for every entry and no SQL file outside the journal", () => {
    const sqlFiles = readdirSync(migrationsFolder)
      .filter((name) => name.endsWith(".sql"))
      .toSorted();

    expect(sqlFiles).toEqual(journal.entries.map((entry) => `${entry.tag}.sql`).toSorted());
  });
});
