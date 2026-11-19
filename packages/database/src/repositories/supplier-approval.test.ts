import { randomUUID } from "node:crypto";
import type { CnpjLookupResult } from "@sellbridge/shared/supplier-approval";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierPaymentAccounts, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { TEST_SUPPLIER_FISCAL } from "../testing/shipment-invoice-fixtures.ts";
import { createSupplierBrand } from "./supplier-brand.ts";
import {
  decideSupplierApprovalByTeam,
  getRequireReceivingAccount,
  getSupplierApprovalState,
  listSuppliersAwaitingTeam,
  runSupplierApprovalCheck,
  setRequireReceivingAccount,
} from "./supplier-approval.ts";
import {
  getDirectorySupplier,
  getSellableCatalogProduct,
  getSellableProducts,
  listActiveSuppliers,
  listCatalogProducts,
  listSellableCatalog,
} from "./suppliers.ts";

const database = createTestDatabase();
const marker = `Aprovação ${randomUUID().slice(0, 8)}`;
const PAGE = { page: 1, pageSize: 50 };
const NOW = new Date("2026-11-18T12:00:00.000Z");
const HOUR_IN_MS = 60 * 60 * 1000;
const ACTIVE: CnpjLookupResult = {
  outcome: "active",
  legalName: "ATELIE DIVINOPOLIS CONFECCOES LTDA",
  registrationStatus: "ATIVA",
};

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let staff: Awaited<ReturnType<typeof createTestUsers>>;
let resellerId = "";
let requiredBefore = false;
const supplierIds: string[] = [];

function staffId(): string {
  const id = staff.ids[0];
  if (id === undefined) {
    throw new Error("usuário de teste não criado");
  }
  return id;
}

function organizationAt(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) {
    throw new Error(`organização de teste ${index} não criada`);
  }
  return id;
}

let nextOrganization = 1;

/** A brand created from the supplier panel, with one approved product. */
async function signUpSupplier(withFiscalProfile: boolean) {
  const brand = await createSupplierBrand(database, {
    organizationId: organizationAt(nextOrganization),
    values: {
      name: `${marker} ${nextOrganization}`,
      niche: "Teste",
      description: "",
      state: "MG",
      city: "Divinópolis",
      logoUrl: null,
      contactEmail: null,
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
      fiscalProfile: withFiscalProfile ? TEST_SUPPLIER_FISCAL : null,
    },
  });
  nextOrganization += 1;
  supplierIds.push(brand.id);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId: brand.id,
      sku: `APR-${nextOrganization}`,
      title: `${marker} produto ${nextOrganization}`,
      costCents: 1000,
      suggestedPriceCents: 1990,
      stock: 10,
      reviewStatus: "approved",
    })
    .returning({ id: supplierProducts.id });
  return { supplierId: brand.id, productId: product?.id ?? "" };
}

function answering(...results: CnpjLookupResult[]) {
  const asked: string[] = [];
  const lookUpCnpj = async (cnpj: string) => {
    asked.push(cnpj);
    return results[Math.min(asked.length - 1, results.length - 1)] ?? { outcome: "unavailable" };
  };
  return { asked, lookUpCnpj };
}

async function visibleToResellers(supplierId: string, productId: string) {
  const sellable = await listSellableCatalog(
    database,
    resellerId,
    { search: marker, sort: "title" },
    PAGE,
  );
  const picked = await getSellableProducts(database, resellerId, [productId]);
  const ofSupplier = await listCatalogProducts(database, supplierId, { sort: "title" }, PAGE);
  const active = await listActiveSuppliers(database, { search: marker });
  return {
    catalog: sellable.items.some((item) => item.id === productId),
    picked: picked.length > 0,
    supplierPage: ofSupplier.items.length > 0,
    supplierList: active.some((supplier) => supplier.id === supplierId),
  };
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 10);
  staff = await createTestUsers(database, 1);
  resellerId = organizationAt(0);
  requiredBefore = await getRequireReceivingAccount(database);
  await setRequireReceivingAccount(database, { required: false, userId: staffId() });
});

afterAll(async () => {
  await setRequireReceivingAccount(database, { required: requiredBefore, userId: staffId() });
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await tenants.cleanup();
  await staff.cleanup();
});

describe("a supplier who signs up alone", () => {
  it("stays hidden from resellers while pending", async () => {
    const { supplierId, productId } = await signUpSupplier(false);

    const visible = await visibleToResellers(supplierId, productId);

    expect(visible).toEqual({
      catalog: false,
      picked: false,
      supplierPage: false,
      supplierList: false,
    });
    await expect(getDirectorySupplier(database, supplierId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getSellableCatalogProduct(database, productId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("waits for the company data without asking the Receita", async () => {
    const { supplierId } = await signUpSupplier(false);
    const lookup = answering(ACTIVE);

    const status = await runSupplierApprovalCheck(database, supplierId, lookup);

    expect(status).toBe("pending");
    expect(lookup.asked).toEqual([]);
    expect(await getSupplierApprovalState(database, supplierId)).toMatchObject({
      stage: "waiting_supplier",
      missing: ["company_data"],
    });
  });

  it("is approved and shown once the CNPJ is active with the same legal name", async () => {
    const { supplierId, productId } = await signUpSupplier(true);
    const lookup = answering(ACTIVE);

    const status = await runSupplierApprovalCheck(database, supplierId, lookup);

    expect(status).toBe("approved");
    expect(lookup.asked).toEqual([TEST_SUPPLIER_FISCAL.cnpj]);
    expect(await visibleToResellers(supplierId, productId)).toEqual({
      catalog: true,
      picked: true,
      supplierPage: true,
      supplierList: true,
    });
  });

  it("goes to the team queue when the CNPJ is inactive", async () => {
    const { supplierId } = await signUpSupplier(true);
    const lookup = answering({ ...ACTIVE, outcome: "inactive", registrationStatus: "BAIXADA" });

    await runSupplierApprovalCheck(database, supplierId, lookup);

    const queue = await listSuppliersAwaitingTeam(database, PAGE);
    expect(queue.items.find((item) => item.supplierId === supplierId)).toMatchObject({
      teamReason: "cnpj_inactive",
      registrationStatus: "BAIXADA",
      typedLegalName: TEST_SUPPLIER_FISCAL.legalName,
    });
  });

  it("waits while the query is down, then goes to the team once an hour has passed", async () => {
    const { supplierId } = await signUpSupplier(true);
    const down = answering({ outcome: "unavailable" });

    await runSupplierApprovalCheck(database, supplierId, { ...down, now: () => NOW });
    const firstState = await getSupplierApprovalState(database, supplierId);
    await runSupplierApprovalCheck(database, supplierId, {
      ...down,
      now: () => new Date(NOW.getTime() + HOUR_IN_MS),
    });

    expect(firstState.stage).toBe("checking");
    expect(down.asked).toHaveLength(1);
    expect(await getSupplierApprovalState(database, supplierId)).toMatchObject({
      stage: "needs_team",
      teamReason: "lookup_unavailable",
    });
  });

  it("is refused by the team with a reason it can read, and stays hidden", async () => {
    const { supplierId, productId } = await signUpSupplier(true);
    await runSupplierApprovalCheck(database, supplierId, answering({ outcome: "not_found" }));

    const status = await decideSupplierApprovalByTeam(database, {
      supplierId,
      userId: staffId(),
      decision: "refuse",
      reason: "O CNPJ informado não existe na Receita.",
    });

    expect(status).toBe("refused");
    expect(await getSupplierApprovalState(database, supplierId)).toMatchObject({
      status: "refused",
      refusalReason: "O CNPJ informado não existe na Receita.",
    });
    expect((await visibleToResellers(supplierId, productId)).catalog).toBe(false);
  });

  it("refuses a second team decision on the same supplier", async () => {
    const { supplierId } = await signUpSupplier(true);
    await decideSupplierApprovalByTeam(database, {
      supplierId,
      userId: staffId(),
      decision: "approve",
    });

    const second = decideSupplierApprovalByTeam(database, {
      supplierId,
      userId: staffId(),
      decision: "refuse",
      reason: "Decidido por outra pessoa da equipe.",
    });

    await expect(second).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("waits for an approved receiving account while the switch is on", async () => {
    const { supplierId } = await signUpSupplier(true);
    await setRequireReceivingAccount(database, { required: true, userId: staffId() });

    try {
      const waiting = await runSupplierApprovalCheck(database, supplierId, answering(ACTIVE));
      const missing = (await getSupplierApprovalState(database, supplierId)).missing;
      await database.insert(supplierPaymentAccounts).values({
        supplierId,
        provider: "asaas",
        status: "connected",
        reviewStatus: "approved",
      });
      const approved = await runSupplierApprovalCheck(database, supplierId, answering(ACTIVE));

      expect(waiting).toBe("pending");
      expect(missing).toEqual(["receiving_account"]);
      expect(approved).toBe("approved");
    } finally {
      await setRequireReceivingAccount(database, { required: false, userId: staffId() });
    }
  });
});

describe("a supplier the team registered", () => {
  it("is approved from the start and never checked", async () => {
    const [supplier] = await database
      .insert(suppliers)
      .values({ name: `${marker} equipe`, niche: "Teste", state: "SP", city: "São Paulo" })
      .returning({ id: suppliers.id });
    const supplierId = supplier?.id ?? "";
    supplierIds.push(supplierId);
    const lookup = answering(ACTIVE);

    const status = await runSupplierApprovalCheck(database, supplierId, lookup);

    expect(status).toBe("approved");
    expect(lookup.asked).toEqual([]);
    const [row] = await database
      .select({ approvalStatus: suppliers.approvalStatus })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId));
    expect(row?.approvalStatus).toBe("approved");
  });
});
