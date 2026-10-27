import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user, userActivity } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { findAccountByEmail, isPendingTeamInvite, listStaffMembers } from "./staff-team.ts";

const database = createTestDatabase();
const agent = `team-agent-${randomUUID()}`;
const invited = `team-invited-${randomUUID()}`;
const reseller = `team-reseller-${randomUUID()}`;
const lastSeen = new Date("2026-01-02T10:00:00.000Z");

beforeAll(async () => {
  await database.insert(user).values([
    {
      id: agent,
      name: "Atendente",
      email: `${agent}@sellbridge.test`,
      role: "agent",
      image: "https://fotos.sellbridge.test/atendente.jpg",
    },
    { id: reseller, name: "Revendedora", email: `${reseller}@sellbridge.test` },
    { id: invited, name: "Convidada", email: `${invited}@sellbridge.test`, role: "supervisor" },
  ]);
  await database.insert(userActivity).values({ userId: agent, lastSeenAt: lastSeen });
});

afterAll(async () => {
  await database.delete(user).where(inArray(user.id, [agent, reseller, invited]));
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
      // Regression: the team list drew initials because the photo never left the database.
      image: "https://fotos.sellbridge.test/atendente.jpg",
    });
    expect(team.some((member) => member.id === reseller)).toBe(false);
  });
});

describe("findAccountByEmail", () => {
  it("finds the account whatever the case of the address", async () => {
    const found = await findAccountByEmail(database, `${reseller}@SellBridge.test`.toUpperCase());
    expect(found).toMatchObject({ id: reseller, emailVerified: false });
    expect(await findAccountByEmail(database, "ninguem@sellbridge.test")).toBeNull();
  });
});

describe("isPendingTeamInvite", () => {
  it("is true only for someone on the team who never came in", async () => {
    expect(await isPendingTeamInvite(database, invited)).toBe(true);
    expect(await isPendingTeamInvite(database, agent)).toBe(false);
    expect(await isPendingTeamInvite(database, reseller)).toBe(false);
  });
});
