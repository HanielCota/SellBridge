import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  APPROVAL_STAGES,
  APPROVAL_TEAM_REASONS,
  CNPJ_LOOKUP_OUTCOMES,
  COMPANY_SIZES,
  SUPPLIER_REFUSAL_REASON_MAX_LENGTH,
  type ApprovalMissingItem,
} from "@sellbridge/shared/supplier-approval";
import { user } from "./auth.ts";
import { suppliers } from "./suppliers.ts";

const quoted = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

/**
 * The automatic check of a supplier who signed up alone (see shared/domain/supplier-approval.ts):
 * the last answer of the public CNPJ query, where the supplier stands while pending and who
 * decided. Only suppliers that went through the check have a row; `suppliers.approval_status`
 * is what every reseller read looks at.
 */
export const supplierApprovals = pgTable(
  "supplier_approvals",
  {
    supplierId: uuid()
      .primaryKey()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    /** Null once decided (approved or refused). */
    stage: text({ enum: APPROVAL_STAGES }),
    /** What the supplier still has to do while `waiting_supplier`. */
    missing: jsonb().$type<ApprovalMissingItem[]>().notNull().default([]),
    /** Why the team has to decide, while `needs_team`. */
    teamReason: text({ enum: APPROVAL_TEAM_REASONS }),
    /** The CNPJ the last query asked about, and its answer. */
    cnpj: text(),
    cnpjOutcome: text({ enum: CNPJ_LOOKUP_OUTCOMES }),
    receitaLegalName: text(),
    registrationStatus: text(),
    /** The Receita size of the last answer; null before it answered or before sizes were kept. */
    companySize: text({ enum: COMPANY_SIZES }),
    checkedAt: timestamp({ withTimezone: true }),
    unavailableSince: timestamp({ withTimezone: true }),
    decidedBy: text({ enum: ["automatic", "team"] }),
    decidedByUserId: text().references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    /** Shown to the supplier in its panel. */
    refusalReason: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The team's queue reads the suppliers needing a decision, the oldest first.
    index("supplier_approvals_needs_team_idx")
      .on(table.updatedAt)
      .where(sql`${table.stage} = 'needs_team'`),
    check(
      "supplier_approvals_stage_check",
      sql`${table.stage} is null or ${table.stage} in (${quoted(APPROVAL_STAGES)})`,
    ),
    check(
      "supplier_approvals_team_reason_check",
      sql`${table.teamReason} is null or ${table.teamReason} in (${quoted(APPROVAL_TEAM_REASONS)})`,
    ),
    check(
      "supplier_approvals_cnpj_outcome_check",
      sql`${table.cnpjOutcome} is null or ${table.cnpjOutcome} in (${quoted(CNPJ_LOOKUP_OUTCOMES)})`,
    ),
    check(
      "supplier_approvals_company_size_check",
      sql`${table.companySize} is null or ${table.companySize} in (${quoted(COMPANY_SIZES)})`,
    ),
    check(
      "supplier_approvals_decided_by_check",
      sql`${table.decidedBy} is null or ${table.decidedBy} in ('automatic','team')`,
    ),
    check(
      "supplier_approvals_refusal_reason_check",
      sql`${table.refusalReason} is null or char_length(${table.refusalReason}) <= ${sql.raw(String(SUPPLIER_REFUSAL_REASON_MAX_LENGTH))}`,
    ),
  ],
);
