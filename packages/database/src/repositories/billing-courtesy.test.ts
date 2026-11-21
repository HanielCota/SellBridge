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
/** Billing on, launch transition over: without a plan nothing new fits. */
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

  it("gives nothing to another account", async () => {
    await expect(mayAdd("stores", tenants.tenantB)).rejects.toThrow("escolha um plano");
  });

  it("replaces the plan and the end when the team changes it", async () => {
    await give("start", null);

    const courtesy = await getBillingCourtesy(database, tenants.tenantA);

    expect(courtesy).toMatchObject({ plan: "start", expiresAt: null, grantedBy: adminId() });
  });

  it("blocks new stores and listings again once it is past its end", async () => {
    await give("elite", new Date(Date.now() - 1000));

    await expect(mayAdd("stores")).rejects.toThrow(
      "Para conectar lojas, escolha um plano em Assinatura.",
    );
    await expect(mayAdd("listings")).rejects.toThrow(
      "Para publicar anúncios, escolha um plano em Assinatura.",
    );
  });

  it("blocks them again once the team takes it back", async () => {
    await give("elite", null);

    const taken = await deleteBillingCourtesy(database, tenants.tenantA);

    expect(taken).toBe(true);
    await expect(mayAdd("stores")).rejects.toThrow("escolha um plano");
    expect(await deleteBillingCourtesy(database, tenants.tenantA)).toBe(false);
  });

  it("refuses a plan that does not exist", async () => {
    const attempt = database
      .insert(billingCourtesies)
      .values({ tenantId: tenants.tenantA, plan: "free", reason: "Teste" });

    await expect(attempt).rejects.toThrow("billing_courtesies");
  });
});
