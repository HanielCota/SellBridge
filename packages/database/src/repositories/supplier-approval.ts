import { notFoundError, conflictError } from "@sellbridge/shared/errors";
import { readSupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import {
  decideSupplierApproval,
  nextCnpjCheck,
  type ApprovalCompany,
  type ApprovalFacts,
  type ApprovalMissingItem,
  type ApprovalStage,
  type ApprovalTeamReason,
  type ApprovalVerdict,
  type CnpjCheck,
  type CnpjLookupResult,
  type SupplierApprovalStatus,
} from "@sellbridge/shared/supplier-approval";
import { and, asc, count, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  platformSettings,
  supplierApprovals,
  supplierPaymentAccounts,
  suppliers,
} from "../schema/index.ts";

/** Where a supplier's approval stands, as its panel and the team's screens show it. */
export interface SupplierApprovalState {
  readonly status: SupplierApprovalStatus;
  /** Null when approved or refused, or when the supplier never went through the check. */
  readonly stage: ApprovalStage | null;
  readonly missing: readonly ApprovalMissingItem[];
  readonly teamReason: ApprovalTeamReason | null;
  readonly refusalReason: string | null;
  readonly registrationStatus: string | null;
  readonly receitaLegalName: string | null;
}

const APPROVED_STATE: SupplierApprovalState = {
  status: "approved",
  stage: null,
  missing: [],
  teamReason: null,
  refusalReason: null,
  registrationStatus: null,
  receitaLegalName: null,
};

/** The supplier's approval, or the approved state for a supplier that never had a check. */
export async function getSupplierApprovalState(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<SupplierApprovalState> {
  const [row] = await database
    .select({
      status: suppliers.approvalStatus,
      stage: supplierApprovals.stage,
      missing: supplierApprovals.missing,
      teamReason: supplierApprovals.teamReason,
      refusalReason: supplierApprovals.refusalReason,
      registrationStatus: supplierApprovals.registrationStatus,
      receitaLegalName: supplierApprovals.receitaLegalName,
    })
    .from(suppliers)
    .leftJoin(supplierApprovals, eq(supplierApprovals.supplierId, suppliers.id))
    .where(eq(suppliers.id, supplierId));
  if (row === undefined) {
    throw notFoundError(`Fornecedor não encontrado (id recebido: ${supplierId})`);
  }
  if (row.status === "approved") {
    return APPROVED_STATE;
  }
  return { ...row, missing: row.missing ?? [] };
}

interface StoredFacts {
  readonly status: SupplierApprovalStatus;
  readonly company: ApprovalCompany | null;
  readonly check: CnpjCheck | null;
  readonly receivingAccountApproved: boolean;
  readonly requireReceivingAccount: boolean;
}

async function readCheck(database: Database, supplierId: string): Promise<CnpjCheck | null> {
  const [row] = await database
    .select({
      cnpj: supplierApprovals.cnpj,
      outcome: supplierApprovals.cnpjOutcome,
      legalName: supplierApprovals.receitaLegalName,
      registrationStatus: supplierApprovals.registrationStatus,
      checkedAt: supplierApprovals.checkedAt,
      unavailableSince: supplierApprovals.unavailableSince,
    })
    .from(supplierApprovals)
    .where(eq(supplierApprovals.supplierId, supplierId));
  if (row?.cnpj == null || row.outcome == null || row.checkedAt == null) {
    return null;
  }
  return { ...row, cnpj: row.cnpj, outcome: row.outcome, checkedAt: row.checkedAt };
}

async function receivingAccountApproved(database: Database, supplierId: string) {
  const [row] = await database
    .select({ id: supplierPaymentAccounts.id })
    .from(supplierPaymentAccounts)
    .where(
      and(
        eq(supplierPaymentAccounts.supplierId, supplierId),
        eq(supplierPaymentAccounts.provider, "asaas"),
        eq(supplierPaymentAccounts.status, "connected"),
        eq(supplierPaymentAccounts.reviewStatus, "approved"),
      ),
    );
  return row !== undefined;
}

/** "Exigir conta de recebimento para aprovar": off until set. */
export async function getRequireReceivingAccount(database: Database): Promise<boolean> {
  const [row] = await database
    .select({ required: platformSettings.requireReceivingAccountForApproval })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row?.required ?? false;
}

export async function setRequireReceivingAccount(
  database: Database,
  input: { required: boolean; userId: string },
): Promise<boolean> {
  const values = {
    requireReceivingAccountForApproval: input.required,
    updatedByUserId: input.userId,
    updatedAt: new Date(),
  };
  const [row] = await database
    .insert(platformSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: platformSettings.id, set: values })
    .returning({ required: platformSettings.requireReceivingAccountForApproval });
  if (row === undefined) {
    throw new Error("Platform settings not saved");
  }
  return row.required;
}

async function readFacts(database: Database, supplierId: string): Promise<StoredFacts> {
  const [supplier] = await database
    .select({ status: suppliers.approvalStatus, fiscalProfile: suppliers.fiscalProfile })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  if (supplier === undefined) {
    throw notFoundError(`Fornecedor não encontrado (id recebido: ${supplierId})`);
  }
  const [check, accountApproved, requireReceivingAccount] = await Promise.all([
    readCheck(database, supplierId),
    receivingAccountApproved(database, supplierId),
    getRequireReceivingAccount(database),
  ]);
  const profile = readSupplierFiscalProfile(supplier.fiscalProfile);
  return {
    status: supplier.status,
    company: profile === null ? null : { cnpj: profile.cnpj, legalName: profile.legalName },
    check,
    receivingAccountApproved: accountApproved,
    requireReceivingAccount,
  };
}

function checkColumns(check: CnpjCheck | null) {
  if (check === null) {
    return {};
  }
  return {
    cnpj: check.cnpj,
    cnpjOutcome: check.outcome,
    receitaLegalName: check.legalName,
    registrationStatus: check.registrationStatus,
    checkedAt: check.checkedAt,
    unavailableSince: check.unavailableSince,
  };
}

/** The stage a verdict leaves the supplier in; a lookup still due means the query is retried. */
function stageColumns(verdict: Exclude<ApprovalVerdict, { kind: "approve" }>) {
  if (verdict.kind === "wait_supplier") {
    return { stage: "waiting_supplier" as const, missing: [...verdict.missing], teamReason: null };
  }
  if (verdict.kind === "needs_team") {
    return { stage: "needs_team" as const, missing: [], teamReason: verdict.reason };
  }
  return { stage: "checking" as const, missing: [], teamReason: null };
}

interface CheckOutcome {
  readonly supplierId: string;
  readonly verdict: ApprovalVerdict;
  readonly check: CnpjCheck | null;
  readonly now: Date;
}

/**
 * Keeps the check's outcome while the supplier is still pending: a team decision taken while
 * the query was running wins, since the supplier row is locked and read again first.
 */
async function saveVerdict(database: Database, outcome: CheckOutcome): Promise<void> {
  const { supplierId, verdict, check, now } = outcome;
  await database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ status: suppliers.approvalStatus })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .for("update");
    if (current?.status !== "pending") {
      return;
    }
    if (verdict.kind === "approve") {
      await transaction
        .update(suppliers)
        .set({ approvalStatus: "approved" })
        .where(eq(suppliers.id, supplierId));
    }
    const values =
      verdict.kind === "approve"
        ? {
            ...checkColumns(check),
            stage: null,
            missing: [],
            teamReason: null,
            decidedBy: "automatic" as const,
            decidedAt: now,
          }
        : { ...checkColumns(check), ...stageColumns(verdict) };
    await transaction
      .insert(supplierApprovals)
      .values({ supplierId, ...values })
      .onConflictDoUpdate({ target: supplierApprovals.supplierId, set: values });
  });
}

export interface ApprovalCheckDependencies {
  readonly lookUpCnpj: (cnpj: string) => Promise<CnpjLookupResult>;
  readonly now?: () => Date;
}

/**
 * Runs the automatic check of a pending supplier: asks the public CNPJ query when the rule says
 * so, keeps the answer, then approves it or records what it waits for. Approved and refused
 * suppliers are left as they are. Returns the supplier's status afterwards.
 */
export async function runSupplierApprovalCheck(
  database: Database,
  supplierId: string,
  dependencies: ApprovalCheckDependencies,
): Promise<SupplierApprovalStatus> {
  const now = dependencies.now?.() ?? new Date();
  const stored = await readFacts(database, supplierId);
  if (stored.status !== "pending") {
    return stored.status;
  }
  const facts: ApprovalFacts = { ...stored, now };
  let verdict = decideSupplierApproval(facts);
  let check = stored.check;
  if (verdict.kind === "lookup" && stored.company !== null) {
    const result = await dependencies.lookUpCnpj(stored.company.cnpj);
    check = nextCnpjCheck(stored.company.cnpj, result, stored.check, now);
    verdict = decideSupplierApproval({ ...facts, check });
  }
  await saveVerdict(database, { supplierId, verdict, check, now });
  return verdict.kind === "approve" ? "approved" : "pending";
}

/**
 * Pending suppliers the round checks again, the least recently checked first, so suppliers who
 * never finish signing up cannot hold every slot. The team's queue is left out: nothing
 * automatic moves it, and checking it again would reset how long it has waited.
 */
export async function listPendingSupplierIds(database: Database, limit: number): Promise<string[]> {
  const rows = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .leftJoin(supplierApprovals, eq(supplierApprovals.supplierId, suppliers.id))
    .where(
      and(
        eq(suppliers.approvalStatus, "pending"),
        or(isNull(supplierApprovals.stage), ne(supplierApprovals.stage, "needs_team")),
      ),
    )
    .orderBy(sql`${supplierApprovals.updatedAt} asc nulls first`, asc(suppliers.createdAt))
    .limit(limit);
  return rows.map((row) => row.id);
}

export interface SupplierAwaitingTeam {
  readonly supplierId: string;
  readonly name: string;
  readonly teamReason: ApprovalTeamReason;
  readonly cnpj: string | null;
  readonly typedLegalName: string | null;
  readonly receitaLegalName: string | null;
  readonly registrationStatus: string | null;
  readonly createdAt: Date;
  /** When the check sent the supplier to the team. */
  readonly waitingSince: Date;
}

const awaitingTeam = and(
  eq(suppliers.approvalStatus, "pending"),
  eq(supplierApprovals.stage, "needs_team"),
);

/** The team's queue: pending suppliers the automatic check could not decide, the oldest first. */
export async function listSuppliersAwaitingTeam(
  database: Database,
  page: { page: number; pageSize: number },
): Promise<{ items: SupplierAwaitingTeam[]; total: number }> {
  const [rows, totals] = await Promise.all([
    database
      .select({
        supplierId: suppliers.id,
        name: suppliers.name,
        teamReason: supplierApprovals.teamReason,
        cnpj: supplierApprovals.cnpj,
        fiscalProfile: suppliers.fiscalProfile,
        receitaLegalName: supplierApprovals.receitaLegalName,
        registrationStatus: supplierApprovals.registrationStatus,
        createdAt: suppliers.createdAt,
        waitingSince: supplierApprovals.updatedAt,
      })
      .from(supplierApprovals)
      .innerJoin(suppliers, eq(suppliers.id, supplierApprovals.supplierId))
      .where(awaitingTeam)
      .orderBy(asc(supplierApprovals.updatedAt), asc(suppliers.id))
      .limit(page.pageSize)
      .offset((page.page - 1) * page.pageSize),
    countSuppliersAwaitingTeam(database),
  ]);
  const items = rows.map(({ fiscalProfile, teamReason, ...row }) => {
    if (teamReason === null) {
      throw new Error(`Supplier ${row.supplierId} awaits the team without a reason`);
    }
    const typedLegalName = readSupplierFiscalProfile(fiscalProfile)?.legalName ?? null;
    return { ...row, teamReason, typedLegalName };
  });
  return { items, total: totals };
}

export async function countSuppliersAwaitingTeam(database: Database): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(supplierApprovals)
    .innerJoin(suppliers, eq(suppliers.id, supplierApprovals.supplierId))
    .where(awaitingTeam);
  return row?.total ?? 0;
}

export type TeamApprovalDecision =
  { readonly decision: "approve" } | { readonly decision: "refuse"; readonly reason: string };

/**
 * The team approves or refuses a pending supplier. A supplier that is no longer pending (the
 * check approved it meanwhile, or a colleague decided first) is refused with a conflict.
 * @throws AppError NOT_FOUND for an unknown supplier, CONFLICT when it is no longer pending.
 */
export async function decideSupplierApprovalByTeam(
  database: Database,
  input: { supplierId: string; userId: string; now?: Date } & TeamApprovalDecision,
): Promise<SupplierApprovalStatus> {
  const now = input.now ?? new Date();
  const status = input.decision === "approve" ? "approved" : "refused";
  return database.transaction(async (transaction) => {
    const updated = await transaction
      .update(suppliers)
      .set({ approvalStatus: status })
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.approvalStatus, "pending")))
      .returning({ id: suppliers.id });
    if (updated.length === 0) {
      const [exists] = await transaction
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId));
      if (exists === undefined) {
        throw notFoundError(`Fornecedor não encontrado (id recebido: ${input.supplierId})`);
      }
      throw conflictError(
        "Este fornecedor já foi decidido. Atualize a página para ver como ficou.",
      );
    }
    const values = {
      stage: null,
      missing: [],
      teamReason: null,
      decidedBy: "team" as const,
      decidedByUserId: input.userId,
      decidedAt: now,
      refusalReason: input.decision === "refuse" ? input.reason : null,
    };
    await transaction
      .insert(supplierApprovals)
      .values({ supplierId: input.supplierId, ...values })
      .onConflictDoUpdate({ target: supplierApprovals.supplierId, set: values });
    return status;
  });
}

/** A brand created from the supplier panel starts pending, with the check not yet run. */
export async function startSupplierApproval(
  executor: DatabaseExecutor,
  supplierId: string,
): Promise<void> {
  await executor
    .insert(supplierApprovals)
    .values({ supplierId, stage: "waiting_supplier", missing: ["company_data"] })
    .onConflictDoNothing();
}
