import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user, userActivity } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { findAccountByEmail, listStaffMembers } from "./staff-team.ts";

const database = createTestDatabase();
const agent = `team-agent-${randomUUID()}`;
const reseller = `team-reseller-${randomUUID()}`;
const lastSeen = new Date("2026-01-02T10:00:00.000Z");

beforeAll(async () => {
  await database.insert(user).values([
    { id: agent, name: "Atendente", email: `${agent}@sellbridge.test`, role: "agent" },
    { id: reseller, name: "Revendedora", email: `${reseller}@sellbridge.test` },
  ]);
  await database.insert(userActivity).values({ userId: agent, lastSeenAt: lastSeen });
});

afterAll(async () => {
  await database.delete(user).where(inArray(user.id, [agent, reseller]));
  await database.$client.end();
});

describe("listStaffMembers", () => {
  it("lists the team with role and last access, and leaves resellers out", async () => {
    const team = await listStaffMembers(database);
    expect(team.find((member) => member.id === agent)).toMatchObject({
      name: "Atendente",
      role: "agent",
      lastSeenAt: lastSeen,
      banned: false,
    });
    expect(team.some((member) => member.id === reseller)).toBe(false);
  });
});

describe("findAccountByEmail", () => {
  it("finds the account whatever the case of the address", async () => {
    const found = await findAccountByEmail(database, `${reseller}@SellBridge.test`.toUpperCase());
    expect(found?.id).toBe(reseller);
    expect(await findAccountByEmail(database, "ninguem@sellbridge.test")).toBeNull();
  });
});
