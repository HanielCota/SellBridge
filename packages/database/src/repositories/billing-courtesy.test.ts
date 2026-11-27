import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billingCourtesies } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, createTestUsers } from "../testing/fixtures.ts";
import {
  assertBillingCapacity,
  deleteBillingCourtesy,
  findBillingAccess,
  getBillingCourtesy,
  saveBillingCourtesy,
} from "./billing.ts";

const database = createTestDatabase();
/** Billing on with no launch transition. */
const RULES = { transition: null };
const DAY = 86_400_000;

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let team: Awaited<ReturnType<typeof createTestUsers>>;

function adminId(): string {
  const [id] = team.ids;
  if (id === undefined) throw new Error("team member not created");
  return id;
}

async function give(plan: "start" | "elite", expiresAt: Date | null) {
  await saveBillingCourtesy(database, {
    tenantId: tenants.tenantA,
    plan,
    expiresAt,
    reason: "Conta do cliente dono do projeto",
    grantedBy: adminId(),
  });
}

async function mayAdd(resource: "stores" | "listings", tenantId = tenants.tenantA) {
  return assertBillingCapacity(database, { tenantId, rules: RULES, resource });
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  team = await createTestUsers(database, 1);
});

afterAll(async () => {
  await tenants.cleanup();
  await team.cleanup();
  await database.$client.end();
});

describe("courtesy plan", () => {
  it("lets the account connect a store and publish a listing, like a paid plan", async () => {
    await give("elite", new Date(Date.now() + 30 * DAY));

    await expect(mayAdd("stores")).resolves.toBeUndefined();
    await expect(mayAdd("listings")).resolves.toBeUndefined();
    expect(await findBillingAccess(database, tenants.tenantA, RULES)).toMatchObject({
      kind: "plan",
      plan: { id: "elite" },
      source: "courtesy",
    });
  });

  it("leaves another account on its own free offer", async () => {
    expect(await findBillingAccess(database, tenants.tenantB, RULES)).toEqual({
      kind: "free",
      salesUsed: 0,
    });
  });

  it("replaces the plan and the end when the team changes it", async () => {
    await give("start", null);

    const courtesy = await getBillingCourtesy(database, tenants.tenantA);

    expect(courtesy).toMatchObject({ plan: "start", expiresAt: null, grantedBy: adminId() });
  });

  it("falls back to the available free sales once the courtesy expires", async () => {
    await give("elite", new Date(Date.now() - 1000));

    expect(await findBillingAccess(database, tenants.tenantA, RULES)).toEqual({
      kind: "free",
      salesUsed: 0,
    });
  });

  it("falls back to the available free sales once the team takes the courtesy back", async () => {
    await give("elite", null);

    const taken = await deleteBillingCourtesy(database, tenants.tenantA);

    expect(taken).toBe(true);
    expect(await findBillingAccess(database, tenants.tenantA, RULES)).toEqual({
      kind: "free",
      salesUsed: 0,
    });
    expect(await deleteBillingCourtesy(database, tenants.tenantA)).toBe(false);
  });

  it("refuses a plan that does not exist", async () => {
    const attempt = database
      .insert(billingCourtesies)
      .values({ tenantId: tenants.tenantA, plan: "free", reason: "Teste" });

    await expect(attempt).rejects.toThrow("billing_courtesies");
  });
});
