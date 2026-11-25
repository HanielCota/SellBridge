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
  createDeveloperEntryLink,
  findOfferedSupplierProductIds,
} from "./developer-entry-links.ts";

const database = createTestDatabase();
const NOW = new Date("2026-11-25T12:00:00Z");
const LATER = new Date("2026-11-25T13:00:00Z");
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

describe("claimDeveloperEntryLink", () => {
  it("hands the choice to the first account that opens the link", async () => {
    const tokenHash = await newLink();

    const claim = await claimDeveloperEntryLink(database, {
      tokenHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
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
    const tokenHash = await newLink();
    const claimer = { tokenHash, userId: resellerId, tenantId: tenants.tenantA, now: NOW };
    await claimDeveloperEntryLink(database, claimer);

    const again = await claimDeveloperEntryLink(database, { ...claimer, now: LATER });

    expect(again.kind).toBe("claimed");
  });

  it("refuses a link another account already used", async () => {
    const tokenHash = await newLink();
    await claimDeveloperEntryLink(database, {
      tokenHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
    });

    const claim = await claimDeveloperEntryLink(database, {
      tokenHash,
      userId: otherResellerId,
      tenantId: tenants.tenantB,
      now: NOW,
    });

    expect(claim).toEqual({ kind: "used" });
  });

  it("refuses a link opened after it expired", async () => {
    const tokenHash = await newLink(NOW);

    const claim = await claimDeveloperEntryLink(database, {
      tokenHash,
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
    });

    expect(claim).toEqual({ kind: "expired" });
  });

  it("refuses a token that was never issued", async () => {
    const claim = await claimDeveloperEntryLink(database, {
      tokenHash: randomUUID(),
      userId: resellerId,
      tenantId: tenants.tenantA,
      now: NOW,
    });

    expect(claim).toEqual({ kind: "not_found" });
  });
});
