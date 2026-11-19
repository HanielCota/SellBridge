import { randomUUID } from "node:crypto";
import { SUPPLIER_WITHOUT_RECEIVING_MESSAGE } from "@sellbridge/shared/receiving-rules";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { platformSettings } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  createTestUsers,
} from "../testing/fixtures.ts";
import { saveAsaasAccount, setPaymentAccountReview } from "./asaas-payments.ts";
import { getReceivingRules, setReceivingRules } from "./receiving-rules.ts";
import { assertStoresSellSupplier } from "./store-suppliers.ts";
import {
  getSellableCatalogProduct,
  listActiveSuppliers,
  listSellableCatalog,
} from "./suppliers.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let tenantId = "";
let userId = "";
const cleanups: (() => Promise<void>)[] = [];
const PAGE = { page: 1, pageSize: 50 };

async function supplierWithProduct(label: string) {
  const sku = `RCV-${label}-${randomUUID().slice(0, 8)}`;
  const created = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(created.cleanup);
  return { ...created, sku };
}

async function approveAsaas(supplierId: string) {
  const account = await saveAsaasAccount(database, {
    supplierId,
    userId,
    providerAccountId: `acc-${supplierId}`,
    walletId: `wallet-${supplierId}`,
    apiKeyEnc: "enc-key",
  });
  await setPaymentAccountReview(database, { accountId: account.id, reviewStatus: "approved" });
}

async function turnRules(choice: {
  requireReceivingAccount: boolean;
  paymentBeforePreparing: boolean;
}) {
  return setReceivingRules(database, { ...choice, userId, now: new Date() });
}

async function catalogSkus(search: string): Promise<string[]> {
  const page = await listSellableCatalog(database, tenantId, { search, sort: "title" }, PAGE);
  return page.items.map((item) => item.sku);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  users = await createTestUsers(database, 1);
  tenantId = tenants.ids[0] ?? "";
  userId = users.ids[0] ?? "";
});

afterEach(async () => {
  await turnRules({ requireReceivingAccount: false, paymentBeforePreparing: false });
});

afterAll(async () => {
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await tenants.cleanup();
  await users.cleanup();
  await database.$client.end();
});

describe("setReceivingRules", () => {
  it("keeps the instant the account rule was first turned on", async () => {
    const first = await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    const second = await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: true });

    expect(second.receivingAccountSince).toEqual(first.receivingAccountSince);
    expect(second.paymentBeforePreparingSince).not.toBeNull();
    expect(await getReceivingRules(database)).toEqual(second);
  });

  it("refuses paying first without the account rule", async () => {
    await expect(
      turnRules({ requireReceivingAccount: false, paymentBeforePreparing: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is refused by the database too when written around the repository", async () => {
    await expect(
      database
        .update(platformSettings)
        .set({ requireReceivingAccountSince: null, paymentBeforePreparingSince: new Date() })
        .where(eq(platformSettings.id, 1)),
    ).rejects.toMatchObject({
      cause: { constraint_name: "platform_settings_payment_before_preparing_check" },
    });
  });
});

describe("receiving-account rule in the reseller catalog", () => {
  it("shows a supplier without an account while the rule is off", async () => {
    const plain = await supplierWithProduct("off");

    expect(await catalogSkus(plain.sku)).toEqual([plain.sku]);
  });

  it("hides the products of a supplier without an approved account while the rule is on", async () => {
    const unpaid = await supplierWithProduct("hidden");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(unpaid.sku)).toEqual([]);
    await expect(getSellableCatalogProduct(database, unpaid.productId, tenantId)).rejects.toThrow(
      "Produto não encontrado no catálogo",
    );
  });

  it("keeps a supplier whose account is still under review hidden", async () => {
    const reviewing = await supplierWithProduct("review");
    await saveAsaasAccount(database, {
      supplierId: reviewing.supplierId,
      userId,
      providerAccountId: `acc-${reviewing.supplierId}`,
      walletId: `wallet-${reviewing.supplierId}`,
      apiKeyEnc: "enc-key",
    });
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(reviewing.sku)).toEqual([]);
  });

  it("shows a supplier with an approved account while the rule is on", async () => {
    const paid = await supplierWithProduct("approved");
    await approveAsaas(paid.supplierId);
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    expect(await catalogSkus(paid.sku)).toEqual([paid.sku]);
    expect((await getSellableCatalogProduct(database, paid.productId, tenantId)).id).toBe(
      paid.productId,
    );
  });

  it("leaves a hidden supplier out of the supplier directory", async () => {
    const unpaid = await supplierWithProduct("directory");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    const found = await listActiveSuppliers(database, { search: `de teste ${unpaid.sku}` });

    expect(found).toEqual([]);
  });
});

describe("receiving-account rule on publishing", () => {
  it("refuses publishing a product of a supplier without an approved account", async () => {
    const unpaid = await supplierWithProduct("publish");
    await turnRules({ requireReceivingAccount: true, paymentBeforePreparing: false });

    await expect(
      assertStoresSellSupplier(database, tenantId, [], unpaid.supplierId),
    ).rejects.toThrow(SUPPLIER_WITHOUT_RECEIVING_MESSAGE);
  });

  it("lets the same supplier publish while the rule is off", async () => {
    const unpaid = await supplierWithProduct("publish-off");

    await expect(
      assertStoresSellSupplier(database, tenantId, [], unpaid.supplierId),
    ).resolves.toBeUndefined();
  });
});
