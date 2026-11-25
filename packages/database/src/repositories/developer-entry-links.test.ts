import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
} from "../testing/fixtures.ts";
import { createDeveloperApiKey } from "./developer-api-keys.ts";
import {
  claimDeveloperEntryLink,
  consumeDeveloperEntryLink,
  createDeveloperEntryLink,
  findOfferedSupplierProductIds,
} from "./developer-entry-links.ts";

const database = createTestDatabase();
const NOW = new Date("2026-11-25T12:00:00Z");
const LATER = new Date("2026-11-25T13:00:00Z");
const FRESH_SINCE = new Date("2026-11-25T11:00:00Z");
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let keyId = "";
let developerId = "";
let resellerId = "";
let otherResellerId = "";

async function newLink(expiresAt = LATER): Promise<string> {
  const tokenHash = randomUUID();
  await createDeveloperEntryLink(database, {
    tokenHash,
    keyId,
    supplierId: catalog.supplierId,
    productIds: [catalog.productId],
    expiresAt,
  });
  return tokenHash;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 3);
  [developerId = "", resellerId = "", otherResellerId = ""] = users.ids;
  catalog = await createTestSupplierProduct(database, {
    sku: `EL-${randomUUID().slice(0, 6)}`,
    title: "Produto do link",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  const key = await createDeveloperApiKey(database, {
    name: "Outro projeto",
    prefix: "sb_dev_test",
    secretHash: randomUUID(),
    scopes: ["suppliers:read"],
    createdByUserId: developerId,
    expiresAt: LATER,
  });
  keyId = key.id;
});

afterAll(async () => {
  await catalog.cleanup();
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("findOfferedSupplierProductIds", () => {
  it("keeps the products resellers can pick", async () => {
    const found = await findOfferedSupplierProductIds(database, catalog.supplierId, [
      catalog.productId,
    ]);

    expect(found).toEqual([catalog.productId]);
  });

  it("leaves out a product of another supplier", async () => {
    const found = await findOfferedSupplierProductIds(database, randomUUID(), [catalog.productId]);

    expect(found).toEqual([]);
  });

  it("leaves out a product that is switched off", async () => {
    await database
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, catalog.productId));

    const found = await findOfferedSupplierProductIds(database, catalog.supplierId, [
      catalog.productId,
    ]);

    await database
      .update(supplierProducts)
      .set({ active: true })
      .where(eq(supplierProducts.id, catalog.productId));
    expect(found).toEqual([]);
  });

  it("leaves out the products of a supplier still waiting for approval", async () => {
    await database
      .update(suppliers)
      .set({ approvalStatus: "pending" })
      .where(eq(suppliers.id, catalog.supplierId));

    const found = await findOfferedSupplierProductIds(database, catalog.supplierId, [
      catalog.productId,
    ]);

    await database
      .update(suppliers)
      .set({ approvalStatus: "approved" })
      .where(eq(suppliers.id, catalog.supplierId));
    expect(found).toEqual([]);
  });
});

/** A link already clicked once: returns the secret the browser would keep. */
async function clickedLink(): Promise<string> {
  const tokenHash = await newLink();
  const choiceHash = randomUUID();
  await consumeDeveloperEntryLink(database, { tokenHash, choiceHash, now: NOW });
  return choiceHash;
}

describe("consumeDeveloperEntryLink", () => {
  it("spends the token on the first click and names the key that made it", async () => {
    const tokenHash = await newLink();

    const first = await consumeDeveloperEntryLink(database, {
      tokenHash,
      choiceHash: randomUUID(),
      now: NOW,
    });

    expect(first).toMatchObject({ kind: "consumed", issuer: { keyId, keyPrefix: "sb_dev_test" } });
  });

  it("refuses a second click on the same link", async () => {
    const tokenHash = await newLink();
    await consumeDeveloperEntryLink(database, { tokenHash, choiceHash: randomUUID(), now: NOW });

    const second = await consumeDeveloperEntryLink(database, {
      tokenHash,
      choiceHash: randomUUID(),
      now: NOW,
    });

    expect(second.kind).toBe("used");
  });

  it("refuses a click after the link expired", async () => {
    const tokenHash = await newLink(NOW);

    const late = await consumeDeveloperEntryLink(database, {
      tokenHash,
      choiceHash: randomUUID(),
      now: NOW,
    });

    expect(late.kind).toBe("expired");
  });

  it("refuses a token that was never issued", async () => {
    const unknown = await consumeDeveloperEntryLink(database, {
      tokenHash: randomUUID(),
      choiceHash: randomUUID(),
      now: NOW,
    });

    expect(unknown).toEqual({ kind: "not_found" });
  });
});

describe("claimDeveloperEntryLink", () => {
  it("hands the choice to the first account that shows the secret", async () => {
    const choiceHash = await clickedLink();

    const claim = await claimDeveloperEntryLink(database, {
      choiceHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
      freshSince: FRESH_SINCE,
    });

    expect(claim).toEqual({
      kind: "claimed",
      link: {
        id: expect.any(String),
        supplierId: catalog.supplierId,
        productIds: [catalog.productId],
      },
    });
  });

  it("shows the same choice again to the account that claimed it", async () => {
    const choiceHash = await clickedLink();
    const claimer = {
      choiceHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
      freshSince: FRESH_SINCE,
    };
    await claimDeveloperEntryLink(database, claimer);

    const again = await claimDeveloperEntryLink(database, { ...claimer, now: LATER });

    expect(again.kind).toBe("claimed");
  });

  it("refuses a choice another account already claimed", async () => {
    const choiceHash = await clickedLink();
    await claimDeveloperEntryLink(database, {
      choiceHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
      freshSince: FRESH_SINCE,
    });

    const claim = await claimDeveloperEntryLink(database, {
      choiceHash,
      userId: otherResellerId,
      tenantId: tenants.tenantB,
      now: NOW,
      freshSince: FRESH_SINCE,
    });

    expect(claim).toEqual({ kind: "used" });
  });

  it("refuses a choice clicked too long ago", async () => {
    const choiceHash = await clickedLink();

    const claim = await claimDeveloperEntryLink(database, {
      choiceHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: LATER,
      freshSince: LATER,
    });

    expect(claim).toEqual({ kind: "expired" });
  });

  it("refuses a secret that was never handed out", async () => {
    const claim = await claimDeveloperEntryLink(database, {
      choiceHash: randomUUID(),
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
      freshSince: FRESH_SINCE,
    });

    expect(claim).toEqual({ kind: "not_found" });
  });
});
