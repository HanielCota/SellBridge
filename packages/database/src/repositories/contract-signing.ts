import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  SIGNING_CODE_MAX_ATTEMPTS,
  SIGNING_CODE_TTL_IN_MINUTES,
  SIGNING_CODES_PER_DAY,
  signingCodeResendWaitInSeconds,
  signingCodeUsable,
} from "@sellbridge/shared/contract-signing";
import { and, count, desc, eq, gt, gte, isNull, lt, ne, notExists, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  contractSignatures,
  contractSigningCodes,
  organization,
  platformSettings,
  tenantProfile,
  user,
} from "../schema/index.ts";

const MINUTE_IN_MS = 60 * 1000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;
/** Codes older than the daily window are only noise: each new request clears them. */
const CODE_KEEP_IN_MS = DAY_IN_MS;

/** When the admin turned the contract requirement on; null while off. */
export async function getContractSigningRequiredSince(
  database: DatabaseExecutor,
): Promise<Date | null> {
  const [row] = await database
    .select({ since: platformSettings.contractSigningRequiredSince })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row?.since ?? null;
}

/** Saves the admin's choice; a switch already on keeps the instant it was turned on. */
export async function setContractSigningRequired(
  database: Database,
  input: { required: boolean; userId: string; now: Date },
): Promise<Date | null> {
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ since: platformSettings.contractSigningRequiredSince })
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .for("update");
    const currentSince = current?.since ?? null;
    const since = input.required ? (currentSince ?? input.now) : null;
    const values = {
      contractSigningRequiredSince: since,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
    await transaction
      .insert(platformSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: platformSettings.id, set: values });
    return since;
  });
}

export interface ContractProfileRef {
  tenantId: string;
  kind: ProfileKind;
  version: string;
}

export async function hasSignedContract(
  database: DatabaseExecutor,
  profile: ContractProfileRef,
): Promise<boolean> {
  const [row] = await database
    .select({ id: contractSignatures.id })
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.tenantId, profile.tenantId),
        eq(contractSignatures.profileKind, profile.kind),
        eq(contractSignatures.contractVersion, profile.version),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** When the profile was created: a profile born after the switch signs before anything else. */
export async function getProfileCreatedAt(
  database: DatabaseExecutor,
  tenantId: string,
): Promise<Date | null> {
  const [row] = await database
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, tenantId));
  return row?.createdAt ?? null;
}

/** Who signs, as the account and the profile say now; null when the account is gone. */
export async function getSigningAccount(
  database: DatabaseExecutor,
  input: { userId: string; tenantId: string },
) {
  const [row] = await database
    .select({
      accountName: user.name,
      email: user.email,
      fullName: tenantProfile.fullName,
      cpf: tenantProfile.cpf,
      cnpj: tenantProfile.cnpj,
      companyName: tenantProfile.companyName,
      phone: tenantProfile.phone,
    })
    .from(user)
    .leftJoin(tenantProfile, eq(tenantProfile.tenantId, input.tenantId))
    .where(eq(user.id, input.userId));
  return row ?? null;
}

/** Profiles of this kind without a signature of `version`: the settings card's consequence. */
export async function countProfilesWithoutSignature(
  database: DatabaseExecutor,
  input: { kind: ProfileKind; version: string },
): Promise<number> {
  const signed = database
    .select({ id: contractSignatures.id })
    .from(contractSignatures)
    .where(
      and(
        eq(contractSignatures.tenantId, organization.id),
        eq(contractSignatures.profileKind, input.kind),
        eq(contractSignatures.contractVersion, input.version),
      ),
    );
  const [row] = await database
    .select({ total: count() })
    .from(organization)
    .where(and(eq(organization.kind, input.kind), notExists(signed)));
  return row?.total ?? 0;
}

export type IssueSigningCodeResult =
  | { kind: "issued"; codeId: string; expiresAt: Date }
  | { kind: "wait"; seconds: number }
  | { kind: "daily_limit" };

interface IssueSigningCodeInput extends ContractProfileRef {
  userId: string;
  codeHash: string;
  now: Date;
}

/**
 * Stores a new code for the person, unless one went out less than a minute ago or the daily
 * limit is reached. Earlier codes keep working until the e-mail of this one goes out
 * (`retireEarlierSigningCodes`); a failed e-mail discards it (`discardSigningCode`). Serialized
 * per person, so a double click never issues two.
 */
export async function issueSigningCode(
  database: Database,
  input: IssueSigningCodeInput,
): Promise<IssueSigningCodeResult> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('contract-signing-code'), hashtext(${input.userId}))`,
    );
    await transaction
      .delete(contractSigningCodes)
      .where(
        and(
          eq(contractSigningCodes.userId, input.userId),
          lt(contractSigningCodes.createdAt, new Date(input.now.getTime() - CODE_KEEP_IN_MS)),
        ),
      );
    const refusal = await codeRequestRefusal(transaction, input.userId, input.now);
    if (refusal !== null) {
      return refusal;
    }
    const expiresAt = new Date(input.now.getTime() + SIGNING_CODE_TTL_IN_MINUTES * MINUTE_IN_MS);
    const [created] = await transaction
      .insert(contractSigningCodes)
      .values({
        userId: input.userId,
        tenantId: input.tenantId,
        profileKind: input.kind,
        contractVersion: input.version,
        codeHash: input.codeHash,
        expiresAt,
        createdAt: input.now,
      })
      .returning({ id: contractSigningCodes.id });
    if (created === undefined) {
      throw new Error("Inserting a signing code returned no row");
    }
    return { kind: "issued", codeId: created.id, expiresAt };
  });
}

/** Once the new code went out by e-mail, the earlier ones of the person stop working. */
export async function retireEarlierSigningCodes(
  database: DatabaseExecutor,
  input: { userId: string; keepCodeId: string; now: Date },
): Promise<void> {
  await database
    .update(contractSigningCodes)
    .set({ expiresAt: input.now })
    .where(
      and(
        eq(contractSigningCodes.userId, input.userId),
        ne(contractSigningCodes.id, input.keepCodeId),
        isNull(contractSigningCodes.consumedAt),
        gt(contractSigningCodes.expiresAt, input.now),
      ),
    );
}

/**
 * Removes a code whose e-mail never went out: it counts neither for the minute of waiting nor
 * for the daily limit, and the earlier code keeps working.
 */
export async function discardSigningCode(
  database: DatabaseExecutor,
  codeId: string,
): Promise<void> {
  await database.delete(contractSigningCodes).where(eq(contractSigningCodes.id, codeId));
}

async function codeRequestRefusal(
  transaction: DatabaseExecutor,
  userId: string,
  now: Date,
): Promise<IssueSigningCodeResult | null> {
  const dayAgo = new Date(now.getTime() - DAY_IN_MS);
  const [latest] = await transaction
    .select({ createdAt: contractSigningCodes.createdAt })
    .from(contractSigningCodes)
    .where(eq(contractSigningCodes.userId, userId))
    .orderBy(desc(contractSigningCodes.createdAt))
    .limit(1);
  const seconds = signingCodeResendWaitInSeconds(latest?.createdAt ?? null, now);
  if (seconds > 0) {
    return { kind: "wait", seconds };
  }
  const [lastDay] = await transaction
    .select({ total: count() })
    .from(contractSigningCodes)
    .where(
      and(eq(contractSigningCodes.userId, userId), gte(contractSigningCodes.createdAt, dayAgo)),
    );
  if ((lastDay?.total ?? 0) >= SIGNING_CODES_PER_DAY) {
    return { kind: "daily_limit" };
  }
  return null;
}

/** What is stored with a signature besides the profile, the user and the code check. */
export interface ContractSignatureEvidence {
  contractHash: string;
  confirmedItemIds: string[];
  signerIdentityEnc: string;
  ipAddressEnc: string | null;
  userAgent: string | null;
  deviceType: string;
  browser: string;
  timeZone: string;
}

export type SignContractResult =
  | { kind: "signed"; signedAt: Date }
  | { kind: "no_code" }
  | { kind: "expired" }
  | { kind: "too_many_attempts" }
  | { kind: "wrong_code"; attemptsLeft: number };

interface SignContractInput extends ContractProfileRef {
  userId: string;
  now: Date;
  /** Compares the typed code with the stored HMAC in constant time (the caller holds the key). */
  codeMatches: (codeHash: string) => boolean;
  evidence: ContractSignatureEvidence;
}

/** The person's latest code for this profile and version, locked until the transaction ends. */
async function latestCodeForUpdate(transaction: DatabaseExecutor, input: SignContractInput) {
  const [code] = await transaction
    .select({
      id: contractSigningCodes.id,
      codeHash: contractSigningCodes.codeHash,
      attempts: contractSigningCodes.attempts,
      expiresAt: contractSigningCodes.expiresAt,
      consumedAt: contractSigningCodes.consumedAt,
    })
    .from(contractSigningCodes)
    .where(
      and(
        eq(contractSigningCodes.userId, input.userId),
        eq(contractSigningCodes.tenantId, input.tenantId),
        eq(contractSigningCodes.profileKind, input.kind),
        eq(contractSigningCodes.contractVersion, input.version),
      ),
    )
    .orderBy(desc(contractSigningCodes.createdAt))
    .limit(1)
    .for("update");
  return code;
}

async function recordSignature(
  transaction: DatabaseExecutor,
  input: SignContractInput,
  codeId: string,
): Promise<void> {
  await transaction
    .update(contractSigningCodes)
    .set({ consumedAt: input.now })
    .where(eq(contractSigningCodes.id, codeId));
  await transaction
    .insert(contractSignatures)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      profileKind: input.kind,
      contractVersion: input.version,
      ...input.evidence,
      verifiedAt: input.now,
      signedAt: input.now,
    })
    .onConflictDoNothing();
}

/**
 * Checks the latest code of the person for this profile and version and, when it matches,
 * records the signature and spends the code in the same transaction. A wrong code counts a try
 * (kept even though nothing is signed). Signing a version already signed keeps the first record.
 */
export async function signContractWithCode(
  database: Database,
  input: SignContractInput,
): Promise<SignContractResult> {
  return database.transaction(async (transaction) => {
    const code = await latestCodeForUpdate(transaction, input);
    if (code === undefined || code.consumedAt !== null) {
      return { kind: "no_code" };
    }
    if (code.attempts >= SIGNING_CODE_MAX_ATTEMPTS) {
      return { kind: "too_many_attempts" };
    }
    if (!signingCodeUsable(code, input.now)) {
      return { kind: "expired" };
    }
    if (!input.codeMatches(code.codeHash)) {
      const attempts = code.attempts + 1;
      await transaction
        .update(contractSigningCodes)
        .set({ attempts })
        .where(eq(contractSigningCodes.id, code.id));
      return {
        kind: "wrong_code",
        attemptsLeft: Math.max(0, SIGNING_CODE_MAX_ATTEMPTS - attempts),
      };
    }
    await recordSignature(transaction, input, code.id);
    return { kind: "signed", signedAt: input.now };
  });
}
