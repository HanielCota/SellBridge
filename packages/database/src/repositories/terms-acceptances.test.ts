import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import { hasAcceptedTerms, recordTermsAcceptance } from "./terms-acceptances.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;

beforeAll(async () => {
  users = await createTestUsers(database, 2);
});

afterAll(async () => {
  await users.cleanup();
  await database.$client.end();
});

// Item 26.a (L4): the acceptance is stored per person, with version and date.
describe("terms acceptances", () => {
  it("records the version once and reads it back for that person only", async () => {
    const [first, second] = users.ids;
    if (first === undefined || second === undefined) throw new Error("missing users");
    expect(await hasAcceptedTerms(database, first, "2026-10-16")).toBe(false);
    await recordTermsAcceptance(database, first, "2026-10-16");
    await recordTermsAcceptance(database, first, "2026-10-16");
    expect(await hasAcceptedTerms(database, first, "2026-10-16")).toBe(true);
    expect(await hasAcceptedTerms(database, first, "2027-01-01")).toBe(false);
    expect(await hasAcceptedTerms(database, second, "2026-10-16")).toBe(false);
  });
});
