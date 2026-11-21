import { SIGNING_CODE_MAX_ATTEMPTS } from "@sellbridge/shared/contract-signing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contractSignatures,
  contractSigningCodes,
  organization,
  platformSettings,
  tenantProfile,
  user,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants, createTestUsers } from "../testing/fixtures.ts";
import {
  type ContractSignatureEvidence,
  countProfilesWithoutSignature,
  discardSigningCode,
  getContractSigningRequiredSince,
  getSigningAccount,
  hasSignedContract,
  issueSigningCode,
  retireEarlierSigningCodes,
  setContractSigningRequired,
  signContractWithCode,
} from "./contract-signing.ts";

const database = createTestDatabase();
const VERSION = "test-version-1";
const STORED_HASH = "stored-hash";
const EVIDENCE: ContractSignatureEvidence = {
  contractHash: "a".repeat(64),
  confirmedItemIds: ["intermediation", "jurisdiction"],
  signerIdentityEnc: "enc:identity",
  ipAddressEnc: "enc:203.0.113.7",
  userAgent: "Mozilla/5.0 (iPhone) Safari/604.1",
  deviceType: "mobile",
  browser: "Safari",
  timeZone: "America/Sao_Paulo",
};
const cleanups: (() => Promise<void>)[] = [];
let tenantId = "";
let userId = "";
let settingsBefore: Date | null = null;

function profile(now: Date) {
  return { tenantId, userId, kind: "seller" as const, version: VERSION, now };
}

async function issue(now: Date) {
  return issueSigningCode(database, { ...profile(now), codeHash: STORED_HASH });
}

async function sign(now: Date, matches: boolean) {
  return signContractWithCode(database, {
    ...profile(now),
    codeMatches: (codeHash) => matches && codeHash === STORED_HASH,
    evidence: EVIDENCE,
  });
}

beforeAll(async () => {
  settingsBefore = await getContractSigningRequiredSince(database);
});

beforeEach(async () => {
  const tenants = await createTestTenants(database, 1);
  const users = await createTestUsers(database, 1);
  cleanups.push(users.cleanup, tenants.cleanup);
  tenantId = tenants.ids[0] ?? "";
  userId = users.ids[0] ?? "";
  await database.update(organization).set({ kind: "seller" }).where(eq(organization.id, tenantId));
});

afterAll(async () => {
  await database.delete(contractSignatures).where(eq(contractSignatures.contractVersion, VERSION));
  for (const cleanup of cleanups.toReversed()) {
    await cleanup();
  }
  await database
    .update(platformSettings)
    .set({ contractSigningRequiredSince: settingsBefore })
    .where(eq(platformSettings.id, 1));
});

describe("the contract switch", () => {
  it("keeps the instant it was first turned on, and clears it when turned off", async () => {
    const first = new Date("2026-12-01T12:00:00Z");

    await setContractSigningRequired(database, { required: true, userId, now: first });
    const again = await setContractSigningRequired(database, {
      required: true,
      userId,
      now: new Date("2026-12-05T12:00:00Z"),
    });
    const off = await setContractSigningRequired(database, { required: false, userId, now: first });

    expect(again).toEqual(first);
    expect(off).toBeNull();
    expect(await getContractSigningRequiredSince(database)).toBeNull();
  });
});

describe("issueSigningCode", () => {
  it("refuses another code within a minute and counts down the wait", async () => {
    const now = new Date();

    await issue(now);
    const second = await issue(new Date(now.getTime() + 20_000));

    expect(second).toEqual({ kind: "wait", seconds: 40 });
  });

  it("stops at five codes in 24 hours, and opens again after them", async () => {
    const start = new Date();
    for (let minute = 0; minute < 5; minute += 1) {
      expect((await issue(new Date(start.getTime() + minute * 61_000))).kind).toBe("issued");
    }

    const sixth = await issue(new Date(start.getTime() + 5 * 61_000));

    expect(sixth).toEqual({ kind: "daily_limit" });
    const nextDay = await issue(new Date(start.getTime() + 25 * 60 * 60_000));
    expect(nextDay.kind).toBe("issued");
  });

  it("keeps the earlier code working until the new e-mail goes out, then retires it", async () => {
    const now = new Date();
    await issue(now);
    await database
      .update(contractSigningCodes)
      .set({ codeHash: "old-hash" })
      .where(eq(contractSigningCodes.userId, userId));
    const later = new Date(now.getTime() + 61_000);
    const second = await issue(later);
    if (second.kind !== "issued") throw new Error("second code not issued");

    const beforeSending = await oldCodeExpiry();
    await retireEarlierSigningCodes(database, { userId, keepCodeId: second.codeId, now: later });
    const afterSending = await oldCodeExpiry();

    expect(beforeSending).toBeGreaterThan(later.getTime());
    expect(afterSending).toBe(later.getTime());
  });

  it("forgets a code whose e-mail failed: no minute of waiting, the earlier code still works", async () => {
    const now = new Date();
    await issue(now);
    const later = new Date(now.getTime() + 61_000);
    const failed = await issue(later);
    if (failed.kind !== "issued") throw new Error("code not issued");

    await discardSigningCode(database, failed.codeId);
    const retry = await issue(new Date(later.getTime() + 1000));

    expect(retry.kind).toBe("issued");
  });
});

async function oldCodeExpiry(): Promise<number | undefined> {
  const [oldCode] = await database
    .select({ expiresAt: contractSigningCodes.expiresAt })
    .from(contractSigningCodes)
    .where(eq(contractSigningCodes.codeHash, "old-hash"));
  return oldCode?.expiresAt.getTime();
}

describe("signContractWithCode", () => {
  it("refuses signing before any code was sent", async () => {
    expect(await sign(new Date(), true)).toEqual({ kind: "no_code" });
  });

  it("counts a wrong code and says how many tries are left", async () => {
    const now = new Date();
    await issue(now);

    const result = await sign(now, false);

    expect(result).toEqual({ kind: "wrong_code", attemptsLeft: SIGNING_CODE_MAX_ATTEMPTS - 1 });
    expect(await hasSignedContract(database, profile(now))).toBe(false);
  });

  it("stops accepting even the right code after five wrong ones", async () => {
    const now = new Date();
    await issue(now);
    for (let attempt = 0; attempt < SIGNING_CODE_MAX_ATTEMPTS; attempt += 1) {
      await sign(now, false);
    }

    expect(await sign(now, true)).toEqual({ kind: "too_many_attempts" });
  });

  it("refuses an expired code", async () => {
    const now = new Date();
    await issue(now);

    const result = await sign(new Date(now.getTime() + 11 * 60_000), true);

    expect(result).toEqual({ kind: "expired" });
  });

  it("records the signature with every piece of proof and spends the code", async () => {
    const now = new Date();
    await issue(now);

    const result = await sign(now, true);
    const [stored] = await database
      .select()
      .from(contractSignatures)
      .where(eq(contractSignatures.tenantId, tenantId));

    expect(result).toEqual({ kind: "signed", signedAt: now });
    expect(stored).toMatchObject({
      userId,
      profileKind: "seller",
      contractVersion: VERSION,
      verificationMethod: "email_code",
      ...EVIDENCE,
    });
    expect(stored?.verifiedAt.getTime()).toBe(now.getTime());
    expect(await hasSignedContract(database, profile(now))).toBe(true);
    // A new version of the text is not covered by the old signature: it asks again.
    expect(await hasSignedContract(database, { ...profile(now), version: "test-version-2" })).toBe(
      false,
    );
    expect(await sign(now, true)).toEqual({ kind: "no_code" });
  });

  it("keeps the proof when the account and the profile are deleted", async () => {
    const now = new Date();
    await issue(now);
    await sign(now, true);
    const [signature] = await database
      .select({ id: contractSignatures.id })
      .from(contractSignatures)
      .where(eq(contractSignatures.tenantId, tenantId));

    await database.delete(user).where(eq(user.id, userId));
    await database.delete(organization).where(eq(organization.id, tenantId));
    const [kept] = await database
      .select()
      .from(contractSignatures)
      .where(inArray(contractSignatures.id, [signature?.id ?? ""]));

    expect(kept).toMatchObject({
      tenantId: null,
      userId: null,
      contractHash: EVIDENCE.contractHash,
    });
  });
});

describe("profiles without a signature", () => {
  it("stops counting a profile once it signs the version", async () => {
    const before = await countProfilesWithoutSignature(database, {
      kind: "seller",
      version: VERSION,
    });
    const now = new Date();
    await issue(now);
    await sign(now, true);

    const after = await countProfilesWithoutSignature(database, {
      kind: "seller",
      version: VERSION,
    });

    expect(after).toBe(before - 1);
  });
});

describe("getSigningAccount", () => {
  it("reads the signer's name, documents and phone from the profile", async () => {
    await database.insert(tenantProfile).values({
      tenantId,
      fullName: "Maria Teste",
      cpf: "52998224725",
      phone: "11912345678",
    });

    const account = await getSigningAccount(database, { userId, tenantId });

    expect(account).toMatchObject({
      fullName: "Maria Teste",
      cpf: "52998224725",
      phone: "11912345678",
      cnpj: null,
    });
    expect(account?.email).toContain("@sellbridge.test");
  });
});
