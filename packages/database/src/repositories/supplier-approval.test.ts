import { randomUUID } from "node:crypto";
import type { CnpjLookupResult } from "@sellbridge/shared/supplier-approval";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierPaymentAccounts, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import { TEST_SUPPLIER_FISCAL } from "../testing/shipment-invoice-fixtures.ts";
import { getSignupRulesSince, setSignupRules } from "./signup-rules.ts";
import { createSupplierBrand } from "./supplier-brand.ts";
import {
  decideSupplierApprovalByTeam,
  getRequireReceivingAccount,
  getSupplierApprovalState,
  listPendingSupplierIds,
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
  companySize: "micro",
};
const MEI: CnpjLookupResult = { ...ACTIVE, companySize: "mei" };

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let staff: Awaited<ReturnType<typeof createTestUsers>>;
let resellerId = "";
let requiredBefore = false;
let signupRulesBefore = false;
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
  tenants = await createTestTenants(database, 20);
  staff = await createTestUsers(database, 1);
  resellerId = organizationAt(0);
  requiredBefore = await getRequireReceivingAccount(database);
  signupRulesBefore = (await getSignupRulesSince(database)) !== null;
  await setSignupRules(database, { enabled: false, userId: staffId(), now: NOW });
  await setRequireReceivingAccount(database, { required: false, userId: staffId() });
});

afterAll(async () => {
  await setRequireReceivingAccount(database, { required: requiredBefore, userId: staffId() });
  await setSignupRules(database, { enabled: signupRulesBefore, userId: staffId(), now: NOW });
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

async function withRulesOn<Result>(run: () => Promise<Result>): Promise<Result> {
  await setSignupRules(database, { enabled: true, userId: staffId(), now: NOW });
  try {
    return await run();
  } finally {
    await setSignupRules(database, { enabled: false, userId: staffId(), now: NOW });
  }
}

describe("a supplier who signs up alone with the contract sign-up rules on", () => {
  it("is refused on its own when the Receita shows an MEI, with the reason in its panel", async () => {
    const { supplierId, productId } = await signUpSupplier(true);

    const status = await withRulesOn(() =>
      runSupplierApprovalCheck(database, supplierId, answering(MEI)),
    );

    expect(status).toBe("refused");
    const state = await getSupplierApprovalState(database, supplierId);
    expect(state.status).toBe("refused");
    expect(state.refusalReason).toContain("MEI");
    expect((await visibleToResellers(supplierId, productId)).catalog).toBe(false);
  });

  it.each(["micro", "small", "other"] as const)(
    "is approved when the company size is %s",
    async (companySize) => {
      const { supplierId } = await signUpSupplier(true);

      const status = await withRulesOn(() =>
        runSupplierApprovalCheck(database, supplierId, answering({ ...ACTIVE, companySize })),
      );

      expect(status).toBe("approved");
    },
  );

  it("goes to the team when the Receita gives no size", async () => {
    const { supplierId } = await signUpSupplier(true);

    await withRulesOn(() =>
      runSupplierApprovalCheck(
        database,
        supplierId,
        answering({ ...ACTIVE, companySize: "unknown" }),
      ),
    );

    expect(await getSupplierApprovalState(database, supplierId)).toMatchObject({
      status: "pending",
      stage: "needs_team",
      teamReason: "company_size_unknown",
    });
  });

  it("keeps waiting, never approved, while the query is down", async () => {
    const { supplierId } = await signUpSupplier(true);

    const status = await withRulesOn(() =>
      runSupplierApprovalCheck(database, supplierId, {
        ...answering({ outcome: "unavailable" }),
        now: () => NOW,
      }),
    );

    expect(status).toBe("pending");
    expect((await getSupplierApprovalState(database, supplierId)).stage).toBe("checking");
  });

  it("can be approved by the team after an automatic MEI refusal", async () => {
    const { supplierId, productId } = await signUpSupplier(true);
    await withRulesOn(() => runSupplierApprovalCheck(database, supplierId, answering(MEI)));

    const status = await decideSupplierApprovalByTeam(database, {
      supplierId,
      userId: staffId(),
      decision: "approve",
    });

    expect(status).toBe("approved");
    expect((await visibleToResellers(supplierId, productId)).catalog).toBe(true);
  });

  it("is approved as before when the switch is off, even as an MEI", async () => {
    const { supplierId } = await signUpSupplier(true);

    const status = await runSupplierApprovalCheck(database, supplierId, answering(MEI));

    expect(status).toBe("approved");
  });

  it("leaves a supplier approved before the switch as it was", async () => {
    const { supplierId, productId } = await signUpSupplier(true);
    await runSupplierApprovalCheck(database, supplierId, answering(MEI));

    const status = await withRulesOn(() =>
      runSupplierApprovalCheck(database, supplierId, answering(MEI)),
    );

    expect(status).toBe("approved");
    expect((await visibleToResellers(supplierId, productId)).catalog).toBe(true);
  });
});

describe("the worker's round of pending suppliers", () => {
  it("leaves the team queue out and takes the least recently checked first", async () => {
    const awaitingTeam = await signUpSupplier(true);
    const checkedFirst = await signUpSupplier(true);
    const checkedLast = await signUpSupplier(true);
    const inactive = answering({ ...ACTIVE, outcome: "inactive", registrationStatus: "BAIXADA" });
    const down = answering({ outcome: "unavailable" });
    await runSupplierApprovalCheck(database, awaitingTeam.supplierId, inactive);
    await runSupplierApprovalCheck(database, checkedFirst.supplierId, down);
    await runSupplierApprovalCheck(database, checkedLast.supplierId, down);
    await runSupplierApprovalCheck(database, checkedFirst.supplierId, down);

    const round = await listPendingSupplierIds(database, 10_000);

    expect(round).not.toContain(awaitingTeam.supplierId);
    expect(round.indexOf(checkedLast.supplierId)).toBeGreaterThanOrEqual(0);
    expect(round.indexOf(checkedLast.supplierId)).toBeLessThan(
      round.indexOf(checkedFirst.supplierId),
    );
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

describe("the contract sign-up rules switch", () => {
  it("keeps the instant it was turned on, and clears it when turned off", async () => {
    const later = new Date(NOW.getTime() + HOUR_IN_MS);

    try {
      await setSignupRules(database, { enabled: true, userId: staffId(), now: NOW });
      const again = await setSignupRules(database, {
        enabled: true,
        userId: staffId(),
        now: later,
      });
      const off = await setSignupRules(database, { enabled: false, userId: staffId(), now: later });

      expect(again).toEqual(NOW);
      expect(off).toBeNull();
    } finally {
      await setSignupRules(database, { enabled: false, userId: staffId(), now: NOW });
    }
  });
});
