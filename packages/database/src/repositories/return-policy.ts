import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  ANSWER_BUSINESS_DAYS_DEFAULT,
  addBusinessDays,
  assertAnswerBusinessDays,
  assertReasonCanChange,
  assertStep,
  forwardDeadline,
  isPastDeadline,
  reasonNeedsPhotos,
  type ReturnDestination,
  type ReturnReason,
  type ReturnStep,
  type StatedReason,
  type SupplierAnswer,
} from "@sellbridge/shared/return-policy";
import { and, eq, lte, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { platformSettings, returnClaimPhotos, returnClaims, suppliers } from "../schema/index.ts";
import { closeNotForwarded, closeReturn, type ClosingClaim } from "./return-policy-close.ts";

export type ReturnSide = "seller" | "supplier";

/** A photo already on disk, waiting for its row. */
export interface NewReturnPhoto {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

interface LockedClaim extends ClosingClaim {
  status: string;
  policyStep: ReturnStep | null;
  destination: ReturnDestination | null;
  sellerTenantId: string;
  supplierOrganizationId: string | null;
  supplierAnsweredAt: Date | null;
  supplierDueAt: Date | null;
  forwardDueAt: Date | null;
}

/** The business days a supplier has when the marketplace gives no review date. */
export async function getReturnAnswerBusinessDays(executor: DatabaseExecutor): Promise<number> {
  const [row] = await executor
    .select({ businessDays: platformSettings.returnAnswerBusinessDays })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row?.businessDays ?? ANSWER_BUSINESS_DAYS_DEFAULT;
}

/** @throws {AppError} VALIDATION when the days are outside 1–5. */
export async function setReturnAnswerBusinessDays(
  database: Database,
  input: { businessDays: number; userId: string },
): Promise<number> {
  const values = {
    returnAnswerBusinessDays: assertAnswerBusinessDays(input.businessDays),
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  };
  const [row] = await database
    .insert(platformSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: platformSettings.id, set: values })
    .returning({ businessDays: platformSettings.returnAnswerBusinessDays });
  if (row === undefined) {
    throw new Error("Return answer deadline not saved");
  }
  return row.businessDays;
}

async function lockClaim(executor: DatabaseExecutor, claimId: string): Promise<LockedClaim> {
  const [claim] = await executor
    .select({
      id: returnClaims.id,
      shipmentId: returnClaims.shipmentId,
      orderId: returnClaims.orderId,
      status: returnClaims.status,
      policyStep: returnClaims.policyStep,
      destination: returnClaims.destination,
      reason: returnClaims.reason,
      supplierCostCents: returnClaims.supplierCostCents,
      returnShippingCents: returnClaims.returnShippingCents,
      supplierResellable: returnClaims.supplierResellable,
      supplierAnsweredAt: returnClaims.supplierAnsweredAt,
      supplierDueAt: returnClaims.supplierDueAt,
      forwardDueAt: returnClaims.forwardDueAt,
      sellerTenantId: returnClaims.sellerTenantId,
      supplierOrganizationId: suppliers.organizationId,
    })
    .from(returnClaims)
    .innerJoin(suppliers, eq(suppliers.id, returnClaims.supplierId))
    .where(eq(returnClaims.id, claimId))
    .limit(1)
    .for("update", { of: returnClaims });
  if (claim === undefined) {
    throw notFoundError("Devolução não encontrada");
  }
  return claim;
}

function sideOf(
  claim: Pick<LockedClaim, "sellerTenantId" | "supplierOrganizationId">,
  tenantId: string,
): ReturnSide | null {
  if (claim.sellerTenantId === tenantId) {
    return "seller";
  }
  if (claim.supplierOrganizationId !== null && claim.supplierOrganizationId === tenantId) {
    return "supplier";
  }
  return null;
}

/**
 * The claim for one side of it. Another profile's claim reads as missing, so nobody learns it
 * exists. Claims outside the policy (older ones, team-run suppliers) are the team's.
 */
async function lockClaimFor(
  executor: DatabaseExecutor,
  input: { claimId: string; tenantId: string },
  side: ReturnSide | "either",
): Promise<LockedClaim & { policyStep: ReturnStep }> {
  const claim = await lockClaim(executor, input.claimId);
  const actual = sideOf(claim, input.tenantId);
  if (actual === null || (side !== "either" && actual !== side)) {
    throw notFoundError("Devolução não encontrada");
  }
  if (claim.policyStep === null) {
    throw conflictError("A equipe SellBridge cuida desta devolução pelo chamado");
  }
  return { ...claim, policyStep: claim.policyStep };
}

/** Which side of a claim a profile is, before any photo is written; throws when neither. */
export async function requireReturnSide(
  executor: DatabaseExecutor,
  input: { claimId: string; tenantId: string },
): Promise<ReturnSide> {
  const [claim] = await executor
    .select({
      sellerTenantId: returnClaims.sellerTenantId,
      supplierOrganizationId: suppliers.organizationId,
    })
    .from(returnClaims)
    .innerJoin(suppliers, eq(suppliers.id, returnClaims.supplierId))
    .where(eq(returnClaims.id, input.claimId))
    .limit(1);
  const side = claim === undefined ? null : sideOf(claim, input.tenantId);
  if (side === null) {
    throw notFoundError("Devolução não encontrada");
  }
  return side;
}

async function addPhotos(
  executor: DatabaseExecutor,
  claimId: string,
  side: ReturnSide,
  photos: readonly NewReturnPhoto[],
): Promise<void> {
  if (photos.length === 0) {
    return;
  }
  await executor
    .insert(returnClaimPhotos)
    .values(photos.map((photo) => ({ ...photo, claimId, side })));
}

async function countPhotos(executor: DatabaseExecutor, claimId: string, side: ReturnSide) {
  const [row] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(returnClaimPhotos)
    .where(and(eq(returnClaimPhotos.claimId, claimId), eq(returnClaimPhotos.side, side)));
  return row?.total ?? 0;
}

async function assertReasonPhotos(
  executor: DatabaseExecutor,
  claimId: string,
  reason: ReturnReason,
  newPhotos: number,
): Promise<void> {
  if (!reasonNeedsPhotos(reason) || newPhotos > 0) {
    return;
  }
  if ((await countPhotos(executor, claimId, "seller")) > 0) {
    return;
  }
  throw validationError("Para defeito, avaria ou produto errado, envie ao menos uma foto");
}

/**
 * The reseller tells why the buyer sent it back, with photos when the supplier is blamed. It can
 * be corrected until the supplier answers.
 */
export async function stateReturnReason(
  database: Database,
  input: { stated: StatedReason; tenantId: string; photos: readonly NewReturnPhoto[]; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const claim = await lockClaimFor(
      transaction,
      { claimId: input.stated.claimId, tenantId: input.tenantId },
      "seller",
    );
    assertReasonCanChange(claim.policyStep, claim.supplierAnsweredAt !== null);
    await assertReasonPhotos(transaction, claim.id, input.stated.reason, input.photos.length);
    await transaction
      .update(returnClaims)
      .set({
        reason: input.stated.reason,
        reasonNote: input.stated.note,
        returnShippingCents: input.stated.returnShippingCents,
        reasonStatedAt: now,
      })
      .where(eq(returnClaims.id, claim.id));
    await addPhotos(transaction, claim.id, "seller", input.photos);
  });
  logger.info("return_policy.reason_stated", { claimId: input.stated.claimId });
}

/**
 * The parcel came back to the reseller's address, not the supplier's: the reseller now has
 * 7 days to send it on, and the supplier's clock stops until it arrives there.
 */
export async function markReturnArrivedAtSeller(
  database: Database,
  input: { claimId: string; tenantId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const claim = await lockClaimFor(transaction, input, "seller");
    assertStep(claim.policyStep, "awaiting_supplier", "marcar a chegada");
    if (claim.destination !== "supplier" || claim.supplierAnsweredAt !== null) {
      throw conflictError("O fornecedor já recebeu e conferiu este pacote");
    }
    await transaction
      .update(returnClaims)
      .set({
        destination: "seller",
        policyStep: "awaiting_forward",
        arrivedAt: now,
        forwardDueAt: forwardDeadline(now),
        supplierDueAt: null,
      })
      .where(eq(returnClaims.id, claim.id));
  });
  logger.info("return_policy.arrived_at_seller", { claimId: input.claimId });
}

/** The reseller sent the parcel on to the supplier, with the tracking code. */
export async function recordReturnForward(
  database: Database,
  input: { claimId: string; tenantId: string; trackingCode: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const claim = await lockClaimFor(transaction, input, "seller");
    assertStep(claim.policyStep, "awaiting_forward", "registrar o reenvio");
    if (isPastDeadline(claim.forwardDueAt, now)) {
      throw conflictError("O prazo para reenviar este pacote terminou");
    }

    await transaction
      .update(returnClaims)
      .set({
        policyStep: "forwarded",
        forwardedAt: now,
        forwardTrackingCode: input.trackingCode,
        forwardDueAt: null,
      })
      .where(eq(returnClaims.id, claim.id));
  });
  logger.info("return_policy.forwarded", { claimId: input.claimId });
}

/**
 * The forwarded parcel reached the supplier (either side can say so): the supplier's business
 * days start now. The marketplace has already decided by then, so its date does not apply.
 */
export async function markReturnReceivedBySupplier(
  database: Database,
  input: { claimId: string; tenantId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const claim = await lockClaimFor(transaction, input, "either");
    assertStep(claim.policyStep, "forwarded", "confirmar a entrega ao fornecedor");
    const businessDays = await getReturnAnswerBusinessDays(transaction);
    await transaction
      .update(returnClaims)
      .set({
        policyStep: "awaiting_supplier",
        supplierReceivedAt: now,
        supplierDueAt: addBusinessDays(now, businessDays),
      })
      .where(eq(returnClaims.id, claim.id));
  });
  logger.info("return_policy.received_by_supplier", { claimId: input.claimId });
}

function assertSupplierOnTime(claim: LockedClaim, now: Date): void {
  if (isPastDeadline(claim.supplierDueAt, now)) {
    throw conflictError(
      "O prazo para conferir esta devolução terminou: vale o que o revendedor disse",
    );
  }
}

/**
 * The supplier checked the product. Agreeing closes the return as the reseller told it; not
 * agreeing (with photos) sends it to the team. Returns the products put back on the shelf.
 *
 * @throws {AppError} VALIDATION when the supplier disagrees without a photo.
 * @throws {AppError} CONFLICT after the deadline or when the return is not waiting for it.
 */
export async function answerReturnAsSupplier(
  database: Database,
  input: {
    answer: SupplierAnswer;
    tenantId: string;
    photos: readonly NewReturnPhoto[];
    now?: Date;
  },
): Promise<{ disputed: boolean; restockedProductIds: string[] }> {
  const now = input.now ?? new Date();
  const disputed = input.answer.verdict === "not_as_described";
  if (disputed && input.photos.length === 0) {
    throw validationError("Envie ao menos uma foto de como o produto chegou");
  }
  return database.transaction(async (transaction) => {
    const claim = await lockClaimFor(
      transaction,
      { claimId: input.answer.claimId, tenantId: input.tenantId },
      "supplier",
    );
    assertStep(claim.policyStep, "awaiting_supplier", "responder");
    assertSupplierOnTime(claim, now);
    await transaction
      .update(returnClaims)
      .set({
        supplierVerdict: input.answer.verdict,
        supplierCondition: input.answer.condition,
        supplierResellable: input.answer.resellable,
        supplierAnsweredAt: now,
        ...(disputed ? { policyStep: "disputed" as const } : {}),
      })
      .where(eq(returnClaims.id, claim.id));
    await addPhotos(transaction, claim.id, "supplier", input.photos);
    if (disputed) {
      return { disputed, restockedProductIds: [] };
    }
    const restockedProductIds = await closeReturn(
      transaction,
      { ...claim, supplierResellable: input.answer.resellable },
      { closeReason: "supplier_agreed", now },
    );
    return { disputed, restockedProductIds };
  });
}

/** The parcel never reached the supplier's address: the team checks the tracking. */
export async function reportReturnNotReceived(
  database: Database,
  input: { claimId: string; tenantId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await database.transaction(async (transaction) => {
    const claim = await lockClaimFor(transaction, input, "supplier");
    assertStep(claim.policyStep, "awaiting_supplier", "avisar que não chegou");
    assertSupplierOnTime(claim, now);
    await transaction
      .update(returnClaims)
      .set({ supplierVerdict: "not_received", supplierAnsweredAt: now, policyStep: "disputed" })
      .where(eq(returnClaims.id, claim.id));
  });
  logger.info("return_policy.not_received", { claimId: input.claimId });
}

/** Overdue returns closed per run; the rest wait for the next one. */
const SWEEP_BATCH = 100;

async function closeIfOverdue(database: Database, claimId: string, now: Date): Promise<boolean> {
  return database.transaction(async (transaction) => {
    const claim = await lockClaim(transaction, claimId);
    if (claim.policyStep === "awaiting_supplier" && isPastDeadline(claim.supplierDueAt, now)) {
      await closeReturn(transaction, claim, { closeReason: "supplier_silent", now });
      return true;
    }
    if (claim.policyStep === "awaiting_forward" && isPastDeadline(claim.forwardDueAt, now)) {
      await closeNotForwarded(transaction, claim, now);
      return true;
    }
    return false;
  });
}

/**
 * Closes the returns whose deadline passed: a supplier who did not answer accepts the reseller's
 * version; a reseller who did not send the parcel on is owed nothing. Each closes in its own
 * transaction, re-checked under the lock, so a last-second answer wins over the sweep.
 */
export async function closeOverdueReturns(database: Database, now: Date = new Date()) {
  const due = await database
    .select({ id: returnClaims.id })
    .from(returnClaims)
    .where(
      or(
        and(eq(returnClaims.policyStep, "awaiting_supplier"), lte(returnClaims.supplierDueAt, now)),
        and(eq(returnClaims.policyStep, "awaiting_forward"), lte(returnClaims.forwardDueAt, now)),
      ),
    )
    .limit(SWEEP_BATCH);
  let closed = 0;
  for (const { id } of due) {
    // Sequential on purpose: a few rows a run, each in its own short transaction.
    if (await closeIfOverdue(database, id, now)) {
      closed += 1;
    }
  }
  return { closed, checked: due.length };
}
