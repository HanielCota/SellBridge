import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type AccountAddress,
  type BuyerAddressResult,
  type BuyerAddressVerdict,
  judgeBuyerAddress,
  keepsRelease,
  type SupplierPlace,
} from "@sellbridge/shared/buyer-address";
import { storeBuyerAddressContent } from "@sellbridge/shared/notification-events";
import { logger } from "@sellbridge/shared/logger";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  storeBuyerAddressChecks,
  storeConnections,
  storeSuppliers,
  suppliers,
} from "../schema/index.ts";
import { clipText, notifyWorkspace } from "./notification-producers.ts";

/** A store's purchase address is checked again once a day. */
export const BUYER_ADDRESS_CHECK_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000;

const NAME_LENGTH = 80;

// Only the fields the comparison needs: a profile that fails other NF-e rules still has its address.
const storedSupplierAddressSchema = z.object({
  address: z.object({ cep: z.string(), street: z.string(), number: z.string() }),
});

/** Where each supplier the store sells ships from, as their NF-e profile says; none without one. */
export async function findStoreSupplierPlaces(
  database: DatabaseExecutor,
  storeConnectionId: string,
): Promise<SupplierPlace[]> {
  const rows = await database
    .select({ supplierId: suppliers.id, fiscalProfile: suppliers.fiscalProfile })
    .from(storeSuppliers)
    .innerJoin(suppliers, eq(suppliers.id, storeSuppliers.supplierId))
    .where(eq(storeSuppliers.storeConnectionId, storeConnectionId));
  return rows.flatMap((row) => {
    const parsed = storedSupplierAddressSchema.safeParse(row.fiscalProfile);
    if (!parsed.success) {
      return [];
    }
    const { cep, street, number } = parsed.data.address;
    return [{ supplierId: row.supplierId, zipCode: cep, street, number }];
  });
}

interface CheckRecord {
  readonly storeConnectionId: string;
  /** Null when the marketplace could not be read. */
  readonly verdict: BuyerAddressVerdict | null;
  readonly now: Date;
}

/**
 * Saves the verdict. A failed read keeps the last verdict (an outage never blocks nor frees a
 * store) and only marks a store never checked as "not checked". The workspace hears about it once,
 * when the purchase address turns into a supplier's.
 */
export async function recordBuyerAddressCheck(
  database: Database,
  record: CheckRecord,
): Promise<BuyerAddressResult> {
  return database.transaction(async (transaction) => {
    const [previous] = await transaction
      .select({
        result: storeBuyerAddressChecks.result,
        supplierId: storeBuyerAddressChecks.supplierId,
        wrongSince: storeBuyerAddressChecks.wrongSince,
        releasedAt: storeBuyerAddressChecks.releasedAt,
      })
      .from(storeBuyerAddressChecks)
      .where(eq(storeBuyerAddressChecks.storeConnectionId, record.storeConnectionId))
      .for("update");
    if (record.verdict === null) {
      return keepLastVerdict(transaction, record, previous?.result ?? null);
    }
    const becameWrong =
      record.verdict.result === "supplier_address" && previous?.result !== "supplier_address";
    const wrongSince = wrongSinceOf(record, previous?.wrongSince ?? null, becameWrong);
    const values = {
      result: record.verdict.result,
      supplierId: record.verdict.result === "supplier_address" ? record.verdict.supplierId : null,
      checkedAt: record.now,
      wrongSince,
    };
    const release =
      previous !== undefined && keepsRelease(previous, record.verdict) ? {} : NO_RELEASE;
    await transaction
      .insert(storeBuyerAddressChecks)
      .values({ storeConnectionId: record.storeConnectionId, ...values })
      .onConflictDoUpdate({
        target: storeBuyerAddressChecks.storeConnectionId,
        set: { ...values, ...release },
      });
    if (becameWrong) {
      await notifyBuyerAddressWrong(transaction, record);
    }
    return record.verdict.result;
  });
}

const NO_RELEASE = { releasedAt: null, releasedBy: null, releaseNote: null } as const;

function wrongSinceOf(record: CheckRecord, previous: Date | null, becameWrong: boolean) {
  if (record.verdict?.result !== "supplier_address") {
    return null;
  }
  return becameWrong ? record.now : previous;
}

async function keepLastVerdict(
  transaction: DatabaseExecutor,
  record: CheckRecord,
  previous: BuyerAddressResult | null,
): Promise<BuyerAddressResult> {
  if (previous !== null) {
    await transaction
      .update(storeBuyerAddressChecks)
      .set({ checkedAt: record.now })
      .where(eq(storeBuyerAddressChecks.storeConnectionId, record.storeConnectionId));
    return previous;
  }
  await transaction
    .insert(storeBuyerAddressChecks)
    .values({
      storeConnectionId: record.storeConnectionId,
      result: "not_checked",
      checkedAt: record.now,
    })
    .onConflictDoNothing();
  return "not_checked";
}

async function notifyBuyerAddressWrong(transaction: DatabaseExecutor, record: CheckRecord) {
  if (record.verdict?.result !== "supplier_address") {
    return;
  }
  const [row] = await transaction
    .select({
      tenantId: storeConnections.tenantId,
      shopName: storeConnections.shopName,
      supplierName: suppliers.name,
    })
    .from(storeConnections)
    .innerJoin(suppliers, eq(suppliers.id, record.verdict.supplierId))
    .where(eq(storeConnections.id, record.storeConnectionId));
  if (row === undefined) {
    return;
  }
  await notifyWorkspace(transaction, {
    tenantId: row.tenantId,
    event: "store_buyer_address",
    dedupeKey: `store:${record.storeConnectionId}:buyer_address:${record.now.toISOString()}`,
    content: storeBuyerAddressContent({
      storeName: clipText(row.shopName, NAME_LENGTH),
      supplierName: clipText(row.supplierName, NAME_LENGTH),
    }),
  });
}

interface StoreCheck {
  readonly storeConnectionId: string;
  /** Reads the account's addresses from the marketplace; never stored nor logged. */
  readonly readAddresses: () => Promise<readonly AccountAddress[]>;
  readonly now: Date;
}

/**
 * Reads the store account's addresses, compares them with its suppliers' and saves the verdict.
 * A marketplace failure is logged (without any address) and keeps the last verdict.
 */
export async function checkStoreBuyerAddress(
  database: Database,
  check: StoreCheck,
): Promise<BuyerAddressResult> {
  const verdict = await readVerdict(database, check);
  return recordBuyerAddressCheck(database, {
    storeConnectionId: check.storeConnectionId,
    verdict,
    now: check.now,
  });
}

async function readVerdict(
  database: Database,
  check: StoreCheck,
): Promise<BuyerAddressVerdict | null> {
  try {
    const [addresses, places] = await Promise.all([
      check.readAddresses(),
      findStoreSupplierPlaces(database, check.storeConnectionId),
    ]);
    return judgeBuyerAddress(addresses, places);
  } catch (error) {
    logger.warn("store.buyer_address_check_failed", {
      storeConnectionId: check.storeConnectionId,
      error,
    });
    return null;
  }
}

/** A connected Mercado Livre store whose purchase address is due for its daily check. */
export interface BuyerAddressCheckTarget {
  id: string;
  marketplace: "mercado_livre";
  externalShopId: string;
  accessTokenEnc: string;
}

/** Connected Mercado Livre stores never checked or checked a day ago or more, oldest first. */
export async function findStoresDueForBuyerAddressCheck(
  database: Database,
  input: { now: Date; limit: number },
): Promise<BuyerAddressCheckTarget[]> {
  const dueBefore = new Date(input.now.getTime() - BUYER_ADDRESS_CHECK_INTERVAL_MILLISECONDS);
  const rows = await database
    .select({
      id: storeConnections.id,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
    })
    .from(storeConnections)
    .leftJoin(
      storeBuyerAddressChecks,
      eq(storeBuyerAddressChecks.storeConnectionId, storeConnections.id),
    )
    .where(
      and(
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.status, "connected"),
        eq(storeConnections.manual, false),
        isNotNull(storeConnections.accessTokenEnc),
        or(
          isNull(storeBuyerAddressChecks.checkedAt),
          lt(storeBuyerAddressChecks.checkedAt, dueBefore),
        ),
      ),
    )
    .orderBy(sql`${storeBuyerAddressChecks.checkedAt} asc nulls first`, asc(storeConnections.id))
    .limit(input.limit);
  return rows.flatMap((row) =>
    row.accessTokenEnc === null
      ? []
      : [{ ...row, marketplace: "mercado_livre" as const, accessTokenEnc: row.accessTokenEnc }],
  );
}

/** A store the reseller asked to check again, with its last verdict. */
export interface RecheckTarget extends BuyerAddressCheckTarget {
  lastCheck: { result: BuyerAddressResult; checkedAt: Date } | null;
}

/**
 * The tenant's store, with what checking its account needs; null when it is not the tenant's, not
 * a connected Mercado Livre store or has no token.
 */
export async function findBuyerAddressCheckTarget(
  database: Database,
  tenantId: string,
  storeConnectionId: string,
): Promise<RecheckTarget | null> {
  const [row] = await database
    .select({
      id: storeConnections.id,
      externalShopId: storeConnections.externalShopId,
      accessTokenEnc: storeConnections.accessTokenEnc,
      lastResult: storeBuyerAddressChecks.result,
      lastCheckedAt: storeBuyerAddressChecks.checkedAt,
    })
    .from(storeConnections)
    .leftJoin(
      storeBuyerAddressChecks,
      eq(storeBuyerAddressChecks.storeConnectionId, storeConnections.id),
    )
    .where(
      and(
        eq(storeConnections.id, storeConnectionId),
        eq(storeConnections.tenantId, tenantId),
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.status, "connected"),
        eq(storeConnections.manual, false),
      ),
    );
  if (row === undefined || row.accessTokenEnc === null) {
    return null;
  }
  const lastCheck =
    row.lastResult === null || row.lastCheckedAt === null
      ? null
      : { result: row.lastResult, checkedAt: row.lastCheckedAt };
  return {
    id: row.id,
    externalShopId: row.externalShopId,
    marketplace: "mercado_livre",
    accessTokenEnc: row.accessTokenEnc,
    lastCheck,
  };
}

/** One store's last check, as the stores page and the dashboard show it. */
export interface BuyerAddressCheckView {
  result: BuyerAddressResult;
  /** The supplier the account buys at; null unless the result is "supplier_address". */
  supplierName: string | null;
  /** Where that supplier ships from, so the reseller finds it among the account's addresses. */
  supplierPlace: SupplierPlaceView | null;
  checkedAt: Date;
  /** When the team released the match as a false alarm; null while it holds the store. */
  releasedAt: Date | null;
  releaseNote: string | null;
}

/** The supplier's street, number and CEP, as its NF-e profile says. */
export interface SupplierPlaceView {
  street: string;
  number: string;
  zipCode: string;
}

function supplierPlaceOf(fiscalProfile: unknown): SupplierPlaceView | null {
  const parsed = storedSupplierAddressSchema.safeParse(fiscalProfile);
  if (!parsed.success) {
    return null;
  }
  const { cep, street, number } = parsed.data.address;
  return { street, number, zipCode: cep };
}

/** The last check of each of the tenant's stores that has one, by store id. */
export async function listBuyerAddressChecks(
  database: Database,
  tenantId: string,
): Promise<Map<string, BuyerAddressCheckView>> {
  const rows = await database
    .select({
      storeConnectionId: storeBuyerAddressChecks.storeConnectionId,
      result: storeBuyerAddressChecks.result,
      supplierName: suppliers.name,
      supplierFiscalProfile: suppliers.fiscalProfile,
      checkedAt: storeBuyerAddressChecks.checkedAt,
      releasedAt: storeBuyerAddressChecks.releasedAt,
      releaseNote: storeBuyerAddressChecks.releaseNote,
    })
    .from(storeBuyerAddressChecks)
    .innerJoin(storeConnections, eq(storeConnections.id, storeBuyerAddressChecks.storeConnectionId))
    .leftJoin(suppliers, eq(suppliers.id, storeBuyerAddressChecks.supplierId))
    .where(eq(storeConnections.tenantId, tenantId));
  return new Map(
    rows.map(({ storeConnectionId, supplierFiscalProfile, ...check }) => [
      storeConnectionId,
      { ...check, supplierPlace: supplierPlaceOf(supplierFiscalProfile) },
    ]),
  );
}

/** The chosen stores of the tenant whose account buys at a supplier's address. */
export async function findStoresHeldByBuyerAddress(
  database: Database,
  tenantId: string,
  storeConnectionIds: readonly string[],
): Promise<{ id: string; shopName: string }[]> {
  if (storeConnectionIds.length === 0) {
    return [];
  }
  return database
    .select({ id: storeConnections.id, shopName: storeConnections.shopName })
    .from(storeBuyerAddressChecks)
    .innerJoin(storeConnections, eq(storeConnections.id, storeBuyerAddressChecks.storeConnectionId))
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
        eq(storeBuyerAddressChecks.result, "supplier_address"),
        isNull(storeBuyerAddressChecks.releasedAt),
      ),
    );
}

/** The tenant's stores held by their purchase address, with when that started, for the bell. */
export async function findHeldStoresForBell(
  database: Database,
  tenantId: string,
  limit: number,
): Promise<{ storeConnectionId: string; shopName: string; heldSince: Date }[]> {
  const rows = await database
    .select({
      storeConnectionId: storeConnections.id,
      shopName: storeConnections.shopName,
      heldSince: storeBuyerAddressChecks.wrongSince,
    })
    .from(storeBuyerAddressChecks)
    .innerJoin(storeConnections, eq(storeConnections.id, storeBuyerAddressChecks.storeConnectionId))
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        eq(storeConnections.status, "connected"),
        eq(storeBuyerAddressChecks.result, "supplier_address"),
        isNull(storeBuyerAddressChecks.releasedAt),
        isNotNull(storeBuyerAddressChecks.wrongSince),
      ),
    )
    .limit(limit);
  return rows.flatMap((row) =>
    row.heldSince === null ? [] : [{ ...row, heldSince: row.heldSince }],
  );
}

interface BuyerAddressRelease {
  readonly tenantId: string;
  readonly storeConnectionId: string;
  /** The team member releasing it. */
  readonly releasedBy: string;
  /** Why it is a false alarm, already validated. */
  readonly note: string;
  readonly now: Date;
}

/**
 * The team found a held store a false alarm (the reseller lives in the supplier's building): the
 * store publishes again until its account matches a different address. Returns the supplier the
 * match was with, or null when the store is not the tenant's or is not held anymore.
 */
export async function releaseBuyerAddressHold(
  database: DatabaseExecutor,
  release: BuyerAddressRelease,
): Promise<{ supplierId: string | null } | null> {
  const tenantStore = database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.id, release.storeConnectionId),
        eq(storeConnections.tenantId, release.tenantId),
      ),
    );
  const [released] = await database
    .update(storeBuyerAddressChecks)
    .set({ releasedAt: release.now, releasedBy: release.releasedBy, releaseNote: release.note })
    .where(
      and(
        inArray(storeBuyerAddressChecks.storeConnectionId, tenantStore),
        eq(storeBuyerAddressChecks.result, "supplier_address"),
        isNull(storeBuyerAddressChecks.releasedAt),
      ),
    )
    .returning({ supplierId: storeBuyerAddressChecks.supplierId });
  return released ?? null;
}
