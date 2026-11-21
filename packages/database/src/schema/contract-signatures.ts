import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";

const PROFILE_KINDS_SQL = sql`('seller', 'supplier')`;

/**
 * The proof of each contract signature (contracts, section 2): who, from where, which version
 * and the SHA-256 of the exact text. Only inserted. It outlives the account (foreign keys set
 * null) because it is kept to defend a dispute; the signer's name, CPF, CNPJ, e-mail and phone
 * and the IP are encrypted (`TokenCipher`), never stored or logged in plain text.
 */
export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().references(() => organization.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    profileKind: text({ enum: ["seller", "supplier"] }).notNull(),
    contractVersion: text().notNull(),
    contractHash: text().notNull(),
    /** The summary lines ticked, by id, in the order shown. */
    confirmedItemIds: jsonb().$type<string[]>().notNull(),
    /** Encrypted JSON: name, CPF, CNPJ, company, e-mail and phone at the moment of signing. */
    signerIdentityEnc: text().notNull(),
    /** Encrypted; null when the request carried no address. */
    ipAddressEnc: text(),
    userAgent: text(),
    deviceType: text().notNull(),
    browser: text().notNull(),
    /** The browser's IANA time zone, e.g. "America/Sao_Paulo". */
    timeZone: text().notNull(),
    /** How the signer proved control of the account; selfie and SMS plug in here later. */
    verificationMethod: text({ enum: ["email_code"] })
      .notNull()
      .default("email_code"),
    verifiedAt: timestamp({ withTimezone: true }).notNull(),
    signedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "contract_signatures_profile_kind_check",
      sql`${table.profileKind} in ${PROFILE_KINDS_SQL}`,
    ),
    check("contract_signatures_hash_check", sql`${table.contractHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "contract_signatures_verification_method_check",
      sql`${table.verificationMethod} in ('email_code')`,
    ),
    /** One signature per profile and version; leads with tenant for the gate's lookup. */
    uniqueIndex("contract_signatures_tenant_version_idx")
      .on(table.tenantId, table.profileKind, table.contractVersion)
      .where(sql`${table.tenantId} is not null`),
    index("contract_signatures_user_idx").on(table.userId),
  ],
);

/**
 * The codes e-mailed to confirm a signature. Only an HMAC of the code is stored; a code works
 * once, for a few minutes and a few tries (`@sellbridge/shared/contract-signing`).
 */
export const contractSigningCodes = pgTable(
  "contract_signing_codes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    profileKind: text({ enum: ["seller", "supplier"] }).notNull(),
    contractVersion: text().notNull(),
    codeHash: text().notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "contract_signing_codes_profile_kind_check",
      sql`${table.profileKind} in ${PROFILE_KINDS_SQL}`,
    ),
    check("contract_signing_codes_attempts_check", sql`${table.attempts} >= 0`),
    /** The person's latest code and the hourly count; leads with user for the cascade too. */
    index("contract_signing_codes_user_created_idx").on(table.userId, table.createdAt),
    index("contract_signing_codes_tenant_idx").on(table.tenantId),
  ],
);
