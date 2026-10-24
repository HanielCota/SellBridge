import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  deactivatingFlagNotice,
  flagDeactivatesSupplier,
  reachedFlagLimit,
  SUPPLIER_FLAG_VALIDITY_DAYS,
  supplierFlagStatus,
  type SupplierFlagReason,
  type SupplierFlagStatus,
} from "@sellbridge/shared/supplier-flags";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../client.ts";
import { supplierFlags, suppliers, user } from "../schema/index.ts";
import { setAdminSupplierActive } from "./admin-suppliers.ts";
import { publicSupplier } from "./sql/sellable.ts";

/**
 * MVP function 6: flags the team applies to a supplier by hand. The team reads the whole history;
 * the supplier reads only its active flags, without who applied them nor any revoke note (those
 * columns are never selected for it).
 */

/** Same arithmetic as the table's check: 90 × 24 hours, whatever the session time zone. */
const VALIDITY_INTERVAL = sql.raw(`interval '${SUPPLIER_FLAG_VALIDITY_DAYS * 24} hours'`);
const MILLISECOND_NOW = sql.raw(`date_trunc('milliseconds', now())`);

export interface TeamSupplierFlag {
  id: string;
  reason: SupplierFlagReason;
  note: string;
  createdAt: Date;
  expiresAt: Date;
  createdByName: string | null;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeNote: string | null;
  status: SupplierFlagStatus;
}

export interface TeamSupplierFlags {
  flags: TeamSupplierFlag[];
  activeCount: number;
  /** 3 or more active flags: the supplier is out unless the team reactivated it. */
  reachedLimit: boolean;
}

export interface AppliedSupplierFlag {
  id: string;
  expiresAt: Date;
  /** Active flags, counting the one just applied. */
  activeCount: number;
  /** This flag was the 3rd active one and put the supplier out. */
  supplierDeactivated: boolean;
  /** Whether the supplier is active after this flag (false when it was already off, too). */
  supplierActive: boolean;
  /** Live listings paused by that deactivation (0 when it did not happen). */
  pausedTargets: number;
}

/** What the supplier sees of one of its active flags. */
export interface SupplierPanelFlag {
  id: string;
  reason: SupplierFlagReason;
  note: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface FlaggableSupplier {
  name: string;
  active: boolean;
}

/**
 * Only the name and whether it is active: the flags page is open to the whole team, while the
 * rest of the supplier record (contact e-mail, deadlines, catalog) stays with admins.
 */
export async function getFlaggableSupplier(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<FlaggableSupplier> {
  const [supplier] = await database
    .select({ name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), publicSupplier()))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor não encontrado: ${supplierId}.`);
  }
  return supplier;
}

/**
 * Locks the supplier's row for the rest of the transaction: two team members applying at once
 * must not both see 2 active flags and both skip the 3rd-flag confirmation.
 */
async function lockFlaggableSupplier(
  transaction: DatabaseExecutor,
  supplierId: string,
): Promise<FlaggableSupplier> {
  const [supplier] = await transaction
    .select({ name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), publicSupplier()))
    .for("update");
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor não encontrado: ${supplierId}.`);
  }
  return supplier;
}

async function countActiveFlags(transaction: DatabaseExecutor, supplierId: string) {
  const [active] = await transaction
    .select({ value: count() })
    .from(supplierFlags)
    .where(
      and(
        eq(supplierFlags.supplierId, supplierId),
        isNull(supplierFlags.revokedAt),
        gt(supplierFlags.expiresAt, sql`${MILLISECOND_NOW}`),
      ),
    );
  return active?.value ?? 0;
}

interface NewSupplierFlag {
  supplierId: string;
  reason: SupplierFlagReason;
  note: string;
  createdBy: string;
}

/**
 * Applies a flag. When it is the 3rd active one of an active supplier (three strikes), it also
 * deactivates the supplier in the same transaction, but only with `confirmDeactivation`: without
 * it the flag is refused, so a team member whose screen still showed 1 flag never puts a supplier
 * out without having been asked.
 */
export async function applySupplierFlag(
  database: DatabaseExecutor,
  input: NewSupplierFlag & { confirmDeactivation?: boolean },
): Promise<AppliedSupplierFlag> {
  return await database.transaction(async (transaction) => {
    const supplier = await lockFlaggableSupplier(transaction, input.supplierId);
    const activeFlagCount = await countActiveFlags(transaction, input.supplierId);
    const deactivates = flagDeactivatesSupplier({
      activeFlagCount,
      supplierActive: supplier.active,
    });
    if (deactivates && input.confirmDeactivation !== true) {
      throw conflictError(
        `${deactivatingFlagNotice(activeFlagCount)}. Confirme o desligamento para aplicar.`,
      );
    }
    const created = await insertSupplierFlag(transaction, input);
    if (!deactivates) {
      return {
        ...created,
        activeCount: activeFlagCount + 1,
        supplierDeactivated: false,
        supplierActive: supplier.active,
        pausedTargets: 0,
      };
    }
    const { pausedTargets } = await setAdminSupplierActive(transaction, input.supplierId, false);
    return {
      ...created,
      activeCount: activeFlagCount + 1,
      supplierDeactivated: true,
      supplierActive: false,
      pausedTargets,
    };
  });
}

async function insertSupplierFlag(
  transaction: DatabaseExecutor,
  input: NewSupplierFlag,
): Promise<{ id: string; expiresAt: Date }> {
  const [created] = await transaction
    .insert(supplierFlags)
    .values({
      supplierId: input.supplierId,
      reason: input.reason,
      note: input.note,
      createdBy: input.createdBy,
      // One `now()` per statement: both columns get the same instant, as the check requires.
      // Cut to milliseconds: Postgres keeps microseconds and a JS Date does not, so an untrimmed
      // flag stayed active in SQL for up to 1 ms after the app already counted it as expired.
      createdAt: sql`${MILLISECOND_NOW}`,
      expiresAt: sql`${MILLISECOND_NOW} + ${VALIDITY_INTERVAL}`,
    })
    .returning({ id: supplierFlags.id, expiresAt: supplierFlags.expiresAt });
  if (created === undefined) {
    throw conflictError("Não foi possível aplicar a flag. Tente de novo.");
  }
  return created;
}

/** Every flag of the supplier, most recent first, with who applied and who revoked it. */
export async function listTeamSupplierFlags(
  database: DatabaseExecutor,
  supplierId: string,
  now: Date,
): Promise<TeamSupplierFlags> {
  const applier = alias(user, "flag_applier");
  const revoker = alias(user, "flag_revoker");
  const rows = await database
    .select({
      id: supplierFlags.id,
      reason: supplierFlags.reason,
      note: supplierFlags.note,
      createdAt: supplierFlags.createdAt,
      expiresAt: supplierFlags.expiresAt,
      createdByName: applier.name,
      revokedAt: supplierFlags.revokedAt,
      revokedByName: revoker.name,
      revokeNote: supplierFlags.revokeNote,
    })
    .from(supplierFlags)
    .leftJoin(applier, eq(applier.id, supplierFlags.createdBy))
    .leftJoin(revoker, eq(revoker.id, supplierFlags.revokedBy))
    .where(eq(supplierFlags.supplierId, supplierId))
    .orderBy(desc(supplierFlags.createdAt), desc(supplierFlags.id));
  const flags = rows.map((row) => ({ ...row, status: supplierFlagStatus(row, now) }));
  const activeCount = flags.filter((flag) => flag.status === "active").length;
  return { flags, activeCount, reachedLimit: reachedFlagLimit(activeCount) };
}

/** The supplier's own active flags, most recent first. */
export async function listActiveSupplierFlags(
  database: DatabaseExecutor,
  supplierId: string,
  now: Date,
): Promise<SupplierPanelFlag[]> {
  return await database
    .select({
      id: supplierFlags.id,
      reason: supplierFlags.reason,
      note: supplierFlags.note,
      createdAt: supplierFlags.createdAt,
      expiresAt: supplierFlags.expiresAt,
    })
    .from(supplierFlags)
    .where(
      and(
        eq(supplierFlags.supplierId, supplierId),
        isNull(supplierFlags.revokedAt),
        gt(supplierFlags.expiresAt, now),
      ),
    )
    .orderBy(desc(supplierFlags.createdAt), desc(supplierFlags.id));
}

async function explainUnrevokable(
  database: DatabaseExecutor,
  input: { supplierId: string; flagId: string },
): Promise<never> {
  const [flag] = await database
    .select({ revokedAt: supplierFlags.revokedAt })
    .from(supplierFlags)
    .where(and(eq(supplierFlags.id, input.flagId), eq(supplierFlags.supplierId, input.supplierId)))
    .limit(1);
  if (flag === undefined) {
    throw notFoundError(`Flag ${input.flagId} não encontrada neste fornecedor.`);
  }
  if (flag.revokedAt !== null) {
    throw conflictError("Esta flag já foi retirada.");
  }
  throw conflictError("Esta flag já venceu e não conta mais.");
}

interface FlagRevocation {
  supplierId: string;
  flagId: string;
  revokedBy: string;
  revokeNote: string;
  now: Date;
}

/**
 * Revokes an active flag of this supplier; one already revoked or expired is refused. Takes the
 * same supplier lock as `applySupplierFlag`: a revoke committing between the apply's count and its
 * commit would leave a supplier put out with only 2 active flags.
 */
export async function revokeSupplierFlag(
  database: DatabaseExecutor,
  input: FlagRevocation,
): Promise<{ id: string }> {
  return await database.transaction(async (transaction) => {
    await lockFlaggableSupplier(transaction, input.supplierId);
    return await revokeLockedFlag(transaction, input);
  });
}

async function revokeLockedFlag(
  transaction: DatabaseExecutor,
  input: FlagRevocation,
): Promise<{ id: string }> {
  const [revoked] = await transaction
    .update(supplierFlags)
    .set({ revokedAt: input.now, revokedBy: input.revokedBy, revokeNote: input.revokeNote })
    .where(
      and(
        eq(supplierFlags.id, input.flagId),
        eq(supplierFlags.supplierId, input.supplierId),
        isNull(supplierFlags.revokedAt),
        gt(supplierFlags.expiresAt, input.now),
      ),
    )
    .returning({ id: supplierFlags.id });
  if (revoked === undefined) {
    return await explainUnrevokable(transaction, input);
  }
  return revoked;
}
