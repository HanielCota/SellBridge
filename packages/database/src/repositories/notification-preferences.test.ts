import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import {
  listNotificationPreferences,
  saveNotificationPreference,
} from "./notification-preferences.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let first = "";
let second = "";

beforeAll(async () => {
  users = await createTestUsers(database, 2);
  [first = "", second = ""] = users.ids;
});

afterAll(async () => {
  await users.cleanup();
  await database.$client.end();
});

describe("notification preferences", () => {
  it("saves one choice per event and channel, the last one winning", async () => {
    await saveNotificationPreference(database, {
      userId: first,
      event: "sale_paid",
      channel: "email",
      enabled: false,
    });
    await saveNotificationPreference(database, {
      userId: first,
      event: "sale_paid",
      channel: "email",
      enabled: true,
    });
    await saveNotificationPreference(database, {
      userId: first,
      event: "listing_failed",
      channel: "in_app",
      enabled: false,
    });
    const saved = await listNotificationPreferences(database, first);
    expect(saved).toEqual(
      expect.arrayContaining([
        { event: "sale_paid", channel: "email", enabled: true },
        { event: "listing_failed", channel: "in_app", enabled: false },
      ]),
    );
    expect(saved).toHaveLength(2);
  });

  it("keeps each person's choices to themself", async () => {
    expect(await listNotificationPreferences(database, second)).toEqual([]);
  });
});
