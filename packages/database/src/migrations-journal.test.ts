import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/*
 * The migrator applies only the entries whose `when` is newer than the last one a database
 * recorded. An entry merged with an older `when` than the one before it is skipped for good on
 * every database already migrated (the 0007/0008 bug), so the journal must only move forward.
 * These checks read the files alone, without a database.
 */

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const journal = z
  .object({ entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })) })
  .parse(JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")));

/** 0008 was written before 0007 and repaired by hand (see migrations.test.ts, M2). */
const REPAIRED_OUT_OF_ORDER_TAGS = new Set(["0008_public_api"]);

describe("migration journal", () => {
  it("numbers the entries in order, without gaps, as their files are named", () => {
    journal.entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      expect(entry.tag.startsWith(`${String(entry.idx).padStart(4, "0")}_`)).toBe(true);
      expect(existsSync(`${migrationsFolder}/${entry.tag}.sql`)).toBe(true);
    });
  });

  it("gives every entry a newer timestamp than the one before it", () => {
    const backwards = journal.entries
      .slice(1)
      .filter((entry, position) => {
        const previous = journal.entries[position];
        if (previous === undefined || REPAIRED_OUT_OF_ORDER_TAGS.has(entry.tag)) {
          return false;
        }
        return entry.when <= previous.when;
      })
      .map((entry) => entry.tag);
    expect(backwards).toEqual([]);
  });
});
