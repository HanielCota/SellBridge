import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { addBusinessDays } from "@sellbridge/shared/return-policy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  orderItems,
  orders,
  returnClaims,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { applyMarketplaceShipment, forwardOrder } from "./fulfillment.ts";
import { decideReturnClaim } from "./return-claims.ts";
import { returnStockOnce } from "./return-policy-close.ts";
import {
  answerReturnAsSupplier,
  closeOverdueReturns,
  markReturnArrivedAtSeller,
  markReturnReceivedBySupplier,
  recordReturnForward,
  reportReturnNotReceived,
  stateReturnReason,
  type NewReturnPhoto,
} from "./return-policy.ts";
import { findReturnPhoto, listOrderReturns } from "./return-policy-views.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let users: Awaited<ReturnType<typeof createTestUsers>>;
let panelSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
let staffId = "";

const UNIT_COST_CENTS = 4000;
const QUANTITY = 2;
const RETURN_LABEL_CENTS = 2290;
const SHELF_UNITS = 10;
const PHOTO: NewReturnPhoto = {
  storageKey: "returns/test/photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1024,
};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  users = await createTestUsers(database, 3);
  const [sellerOwnerId = "", supplierOwnerId = "", staff = ""] = users.ids;
  staffId = staff;
  for (const [organizationId, userId] of [
    [tenants.tenantA, sellerOwnerId],
    [tenants.tenantB, supplierOwnerId],
  ] as const) {
    await database
      .insert(member)
      .values({ id: randomUUID(), organizationId, userId, role: "owner", createdAt: new Date() });
  }
  panelSupplier = await createTestSupplierProduct(database, {
    sku: "POLICY-PANEL",
    title: "Tênis",
    costCents: UNIT_COST_CENTS,
    suggestedPriceCents: 9000,
  });
  await database
    .update(suppliers)
    .set({ organizationId: tenants.tenantB })
    .where(eq(suppliers.id, panelSupplier.supplierId));
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await panelSupplier.cleanup();
  await users.cleanup();
  await database.$client.end();
});

async function setShelf(units: number) {
  await database
    .update(supplierProducts)
    .set({ stock: units, reservedStock: 0 })
    .where(eq(supplierProducts.id, panelSupplier.productId));
}

async function shelfUnits(): Promise<number> {
  const [row] = await database
    .select({ stock: supplierProducts.stock })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, panelSupplier.productId));
  return row?.stock ?? Number.NaN;
}

/** A sold, forwarded order whose parcel the marketplace reports as back with the sender. */
async function openReturn(openedAt = new Date()) {
  await setShelf(SHELF_UNITS);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: `ML-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 18000,
      orderedAt: openedAt,
    })
    .returning();
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values({
    tenantId: tenants.tenantA,
    orderId: order.id,
    supplierProductId: panelSupplier.productId,
    title: "Tênis - Preto 40",
    quantity: QUANTITY,
    unitPriceCents: 9000,
    unitCostCents: UNIT_COST_CENTS,
  });
  await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  await applyMarketplaceShipment(database, tenants.tenantA, order.id, {
    status: "returned",
    trackingStatus: "returned",
    buyerReturnDelivered: false,
    carrier: "Mercado Envios",
    trackingCode: "ML-RET",
  });
  const [claim] = await database
    .select()
    .from(returnClaims)
    .where(eq(returnClaims.orderId, order.id));
  if (claim === undefined) throw new Error("No claim");
  return { order, claim };
}

async function claimRow(claimId: string) {
  const [row] = await database.select().from(returnClaims).where(eq(returnClaims.id, claimId));
  if (row === undefined) throw new Error("No claim");
  return row;
}

function seller(claimId: string) {
  return { claimId, tenantId: tenants.tenantA };
}

function supplier(claimId: string) {
  return { claimId, tenantId: tenants.tenantB };
}

function stateReason(claimId: string, reason: "defect" | "regret", photos: NewReturnPhoto[]) {
  return stateReturnReason(database, {
    stated: { claimId, reason, note: "", returnShippingCents: RETURN_LABEL_CENTS },
    tenantId: tenants.tenantA,
    photos,
  });
}

function answer(
  claimId: string,
  verdict: "as_described" | "not_as_described",
  options: { resellable: boolean; photos?: NewReturnPhoto[]; now?: Date },
) {
  return answerReturnAsSupplier(database, {
    answer: {
      claimId,
      verdict,
      condition: verdict === "as_described" ? "" : "Chegou sem a caixa",
      resellable: options.resellable,
    },
    tenantId: tenants.tenantB,
    photos: options.photos ?? [],
    now: options.now,
  });
}

describe("opening a return under the policy", () => {
  it("waits for the supplier with the admin's 3 business days when the marketplace gives no date", async () => {
    const { claim } = await openReturn();

    expect(claim.policyStep).toBe("awaiting_supplier");
    expect(claim.destination).toBe("supplier");
    expect(claim.arrivedAt).not.toBeNull();
    expect(claim.supplierDueAt).toEqual(addBusinessDays(claim.arrivedAt ?? new Date(), 3));
  });
});

describe("stateReturnReason", () => {
  it("asks for a photo when the reseller blames the supplier", async () => {
    const { claim } = await openReturn();

    await expect(stateReason(claim.id, "defect", [])).rejects.toMatchObject({ code: "VALIDATION" });
    await stateReason(claim.id, "defect", [PHOTO]);

    expect((await claimRow(claim.id)).reason).toBe("defect");
  });

  it("never lets another profile tell the reason", async () => {
    const { claim } = await openReturn();

    const attempt = stateReturnReason(database, {
      stated: { claimId: claim.id, reason: "regret", note: "", returnShippingCents: null },
      tenantId: tenants.tenantB,
      photos: [],
    });

    await expect(attempt).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("answerReturnAsSupplier", () => {
  it("closes as the reseller told it, with the return label owed for a defect", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "defect", [PHOTO]);

    const result = await answer(claim.id, "as_described", { resellable: false });

    const closed = await claimRow(claim.id);
    expect(result).toEqual({ disputed: false, restockedProductIds: [] });
    expect(closed.policyStep).toBe("closed");
    expect(closed.closeReason).toBe("supplier_agreed");
    expect(closed.status).toBe("credited");
    expect(closed.creditedCents).toBe(UNIT_COST_CENTS * QUANTITY);
    expect(closed.supplierOwesShippingCents).toBe(RETURN_LABEL_CENTS);
    expect(await shelfUnits()).toBe(SHELF_UNITS);
  });

  it("puts a product the buyer gave up on back on the shelf, once", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "regret", []);

    const result = await answer(claim.id, "as_described", { resellable: true });
    await returnStockOnce(database, claim, new Date());

    expect(result.restockedProductIds).toEqual([panelSupplier.productId]);
    expect(await shelfUnits()).toBe(SHELF_UNITS + QUANTITY);
    expect((await claimRow(claim.id)).supplierOwesShippingCents).toBe(0);
  });

  it("sends a disagreement to the team and keeps the money held", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "defect", [PHOTO]);

    await expect(answer(claim.id, "not_as_described", { resellable: true })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const result = await answer(claim.id, "not_as_described", {
      resellable: true,
      photos: [PHOTO],
    });

    const disputed = await claimRow(claim.id);
    expect(result.disputed).toBe(true);
    expect(disputed.policyStep).toBe("disputed");
    expect(disputed.status).toBe("in_review");
    const [view] = await listOrderReturns(database, {
      tenantId: tenants.tenantA,
      orderId: claim.orderId,
    });
    expect(view?.policy.photos.map((photo) => photo.side)).toEqual(["seller", "supplier"]);
  });

  it("refuses an answer after the deadline", async () => {
    const { claim } = await openReturn();
    const late = new Date((claim.supplierDueAt ?? new Date()).getTime() + 1000);

    const attempt = answer(claim.id, "as_described", { resellable: true, now: late });

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("decideReturnClaim under the policy", () => {
  it("waits for the supplier before the team can decide", async () => {
    const { claim } = await openReturn();

    const attempt = decideReturnClaim(database, {
      decision: { claimId: claim.id, decision: "credit", amountCents: 100 },
      actorId: staffId,
    });

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("closes a dispute with the team's decision and the stock the supplier can resell", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "defect", [PHOTO]);
    await answer(claim.id, "not_as_described", { resellable: true, photos: [PHOTO] });

    const result = await decideReturnClaim(database, {
      decision: { claimId: claim.id, decision: "refuse", reason: "As fotos mostram uso" },
      actorId: staffId,
    });

    const closed = await claimRow(claim.id);
    expect(result.status).toBe("refused");
    expect(closed.closeReason).toBe("team_decided");
    expect(closed.supplierOwesShippingCents).toBe(0);
    expect(await shelfUnits()).toBe(SHELF_UNITS + QUANTITY);
  });

  it("lets the team look into a parcel the supplier never received", async () => {
    const { claim } = await openReturn();

    await reportReturnNotReceived(database, supplier(claim.id));

    expect((await claimRow(claim.id)).policyStep).toBe("disputed");
  });
});

describe("a parcel that came back to the reseller", () => {
  it("starts the supplier's business days only when the forwarded parcel arrives", async () => {
    const { claim } = await openReturn();

    await markReturnArrivedAtSeller(database, seller(claim.id));
    const waiting = await claimRow(claim.id);
    await recordReturnForward(database, { ...seller(claim.id), trackingCode: "BR123456789" });
    const receivedAt = new Date("2026-11-20T15:00:00-03:00");
    await markReturnReceivedBySupplier(database, { ...supplier(claim.id), now: receivedAt });

    const received = await claimRow(claim.id);
    expect(waiting.policyStep).toBe("awaiting_forward");
    expect(waiting.supplierDueAt).toBeNull();
    expect(received.policyStep).toBe("awaiting_supplier");
    expect(received.forwardTrackingCode).toBe("BR123456789");
    expect(received.supplierDueAt?.toISOString()).toBe("2026-11-26T03:00:00.000Z");
  });
});

describe("closeOverdueReturns", () => {
  it("lets the reseller's version stand when the supplier does not answer in time", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "defect", [PHOTO]);
    const afterDeadline = new Date((claim.supplierDueAt ?? new Date()).getTime() + 1000);

    await closeOverdueReturns(database, afterDeadline);

    const closed = await claimRow(claim.id);
    expect(closed.closeReason).toBe("supplier_silent");
    expect(closed.status).toBe("credited");
    expect(closed.supplierOwesShippingCents).toBe(RETURN_LABEL_CENTS);
    // Nobody said the product can be sold again: the shelf stays as it was.
    expect(await shelfUnits()).toBe(SHELF_UNITS);
  });

  it("owes the reseller nothing when it never sent the parcel on", async () => {
    const { claim } = await openReturn();
    await markReturnArrivedAtSeller(database, seller(claim.id));
    const arrived = await claimRow(claim.id);
    const afterWindow = new Date((arrived.forwardDueAt ?? new Date()).getTime() + 1000);

    await closeOverdueReturns(database, afterWindow);

    const closed = await claimRow(claim.id);
    expect(closed.closeReason).toBe("not_forwarded");
    expect(closed.status).toBe("refused");
    expect(closed.creditedCents).toBeNull();
  });

  it("leaves a return on time alone", async () => {
    const { claim } = await openReturn();

    await closeOverdueReturns(
      database,
      new Date((claim.supplierDueAt ?? new Date()).getTime() - 1000),
    );

    expect((await claimRow(claim.id)).policyStep).toBe("awaiting_supplier");
  });
});

describe("findReturnPhoto", () => {
  it("shows a return's photo only to its two sides and the team", async () => {
    const { claim } = await openReturn();
    await stateReason(claim.id, "defect", [PHOTO]);
    const [view] = await listOrderReturns(database, {
      tenantId: tenants.tenantA,
      orderId: claim.orderId,
    });
    const photoId = view?.policy.photos[0]?.id ?? "";

    const forSupplier = await findReturnPhoto(database, { photoId, tenantId: tenants.tenantB });
    const forTeam = await findReturnPhoto(database, { photoId, tenantId: null });

    expect(forSupplier.storageKey).toBe(PHOTO.storageKey);
    expect(forTeam.storageKey).toBe(PHOTO.storageKey);
    await expect(
      findReturnPhoto(database, { photoId, tenantId: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
