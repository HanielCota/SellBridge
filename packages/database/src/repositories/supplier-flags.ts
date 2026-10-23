import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  needsTeamAttention,
  SUPPLIER_FLAG_VALIDITY_DAYS,
  supplierFlagStatus,
  type SupplierFlagReason,
  type SupplierFlagStatus,
} from "@sellbridge/shared/supplier-flags";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../client.ts";
import { supplierFlags, suppliers, user } from "../schema/index.ts";
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
  /** 3 or more active flags: the team should look at the supplier. Nothing else happens. */
  needsAttention: boolean;
}

/** What the supplier sees of one of its active flags. */
export interface SupplierPanelFlag {
  id: string;
  reason: SupplierFlagReason;
  note: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Only the name: the flags page is open to the whole team, while the rest of the supplier record
 * (contact e-mail, deadlines, catalog) stays with admins.
 */
export async function getFlaggableSupplierName(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<string> {
  const [supplier] = await database
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), publicSupplier()))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor não encontrado: ${supplierId}.`);
  }
  return supplier.name;
}

async function assertFlaggableSupplier(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<void> {
  await getFlaggableSupplierName(database, supplierId);
}

export async function applySupplierFlag(
  database: DatabaseExecutor,
  input: { supplierId: string; reason: SupplierFlagReason; note: string; createdBy: string },
): Promise<{ id: string; expiresAt: Date }> {
  await assertFlaggableSupplier(database, input.supplierId);
  const [created] = await database
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
  return { flags, activeCount, needsAttention: needsTeamAttention(activeCount) };
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

/** Revokes an active flag of this supplier; one already revoked or expired is refused. */
export async function revokeSupplierFlag(
  database: DatabaseExecutor,
  input: { supplierId: string; flagId: string; revokedBy: string; revokeNote: string; now: Date },
): Promise<{ id: string }> {
  const [revoked] = await database
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
    return await explainUnrevokable(database, input);
  }
  return revoked;
}
