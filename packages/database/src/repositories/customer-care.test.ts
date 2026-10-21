import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { userActivity } from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import {
  assignIssue,
  listAdminEvents,
  listIssueTriage,
  recordAdminEvent,
  snoozeIssue,
  touchUserActivity,
} from "./customer-care.ts";

const database = createTestDatabase();
let users: Awaited<ReturnType<typeof createTestUsers>>;
let adminId = "";
let customerId = "";

beforeAll(async () => {
  users = await createTestUsers(database, 2);
  [adminId = "", customerId = ""] = users.ids;
});

afterAll(async () => {
  await users.cleanup();
});

describe("customer care", () => {
  it("keeps the admin trail newest first, with who did it", async () => {
    await recordAdminEvent(database, { adminId, userId: customerId, action: "ban_changed" });
    await recordAdminEvent(database, {
      adminId,
      userId: customerId,
      action: "onboarding_reminder_sent",
      details: { step: "store" },
    });
    const events = await listAdminEvents(database, customerId, 10);
    expect(events.map((event) => event.action)).toEqual([
      "onboarding_reminder_sent",
      "ban_changed",
    ]);
    expect(events[0]).toMatchObject({ adminName: "Usuário 0", details: { step: "store" } });
  });

  it("only moves the last sign-in forward", async () => {
    const recent = new Date("2026-10-10T12:00:00Z");
    await touchUserActivity(database, customerId, recent);
    await touchUserActivity(database, customerId, new Date("2026-09-01T12:00:00Z"));
    const [row] = await database
      .select()
      .from(userActivity)
      .where(eq(userActivity.userId, customerId));
    expect(row?.lastSeenAt.toISOString()).toBe(recent.toISOString());
  });

  it("stores assignment and snooze for the same issue side by side", async () => {
    const until = new Date("2026-10-14T12:00:00Z");
    await assignIssue(database, { userId: customerId, issueKind: "store", assigneeId: adminId });
    await snoozeIssue(database, { userId: customerId, issueKind: "store", snoozedUntil: until });
    const triage = (await listIssueTriage(database)).filter((row) => row.userId === customerId);
    expect(triage).toEqual([
      {
        userId: customerId,
        issueKind: "store",
        assigneeId: adminId,
        assigneeName: "Usuário 0",
        snoozedUntil: until,
      },
    ]);
  });
});
