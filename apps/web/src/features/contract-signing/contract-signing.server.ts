import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  getContractSigningRequiredSince,
  getProfileCreatedAt,
  getSigningAccount,
  hasSignedContract,
  discardSigningCode,
  issueSigningCode,
  retireEarlierSigningCodes,
  signContractWithCode,
  type ContractSignatureEvidence,
  type SignContractResult,
} from "@sellbridge/database/repositories";
import { contractCodeEmail } from "@sellbridge/shared/contract-code-email";
import { contractFor, type ContractDocument } from "@sellbridge/shared/contract-documents";
import { contractFingerprint } from "@sellbridge/shared/contract-fingerprint";
import {
  canSignContract,
  contractStanding,
  describeUserAgent,
  SIGNING_CODE_LENGTH,
  type ContractStanding,
  uncheckedSummaryItems,
} from "@sellbridge/shared/contract-signing";
import {
  conflictError,
  notFoundError,
  rateLimitedError,
  validationError,
} from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { maskEmail } from "@/features/admin/email-change.server";
import { clientAddress } from "@/lib/server/client-address";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { type OutgoingEmail, sendEmail } from "@/lib/server/mailer";
import { tokenCipher } from "@/lib/server/marketplaces";

/** Long enough for any real browser; a longer header is cut, not refused. */
const MAX_USER_AGENT_LENGTH = 512;

export interface SigningProfile {
  userId: string;
  tenantId: string;
  kind: ProfileKind;
}

/**
 * Where the profile stands with the contract in force. With the switch off it reads one row
 * and nothing else changes for anyone.
 */
export async function loadContractStanding(
  tenantId: string,
  kind: ProfileKind,
  now = new Date(),
): Promise<ContractStanding> {
  const requiredSince = await getContractSigningRequiredSince(database);
  if (requiredSince === null) {
    return { kind: "not_required" };
  }
  const contract = contractFor(kind);
  const [signedVersionInForce, profileCreatedAt] = await Promise.all([
    hasSignedContract(database, { tenantId, kind, version: contract.version }),
    getProfileCreatedAt(database, tenantId),
  ]);
  if (profileCreatedAt === null) {
    throw notFoundError("Perfil não encontrado");
  }
  return contractStanding({ requiredSince, signedVersionInForce, profileCreatedAt, contract, now });
}

/** The HMAC of a code, keyed by the server secret and bound to the person who asked for it. */
function signingCodeHash(userId: string, code: string): string {
  return createHmac("sha256", environment.BETTER_AUTH_SECRET)
    .update(`contract-signing:${userId}:${code}`)
    .digest("hex");
}

function codeMatcher(userId: string, typedCode: string): (storedHash: string) => boolean {
  const typed = Buffer.from(signingCodeHash(userId, typedCode), "hex");
  return (storedHash) => {
    const stored = Buffer.from(storedHash, "hex");
    return stored.length === typed.length && timingSafeEqual(stored, typed);
  };
}

function newSigningCode(): string {
  return randomInt(0, 10 ** SIGNING_CODE_LENGTH)
    .toString()
    .padStart(SIGNING_CODE_LENGTH, "0");
}

interface SigningRequest {
  version: string;
  confirmedItemIds: readonly string[];
}

/**
 * The contract the person may sign now: the switch is on, the version on screen is the one in
 * force and every summary line is ticked.
 *
 * @throws {AppError} CONFLICT when signing is not open or the text changed; VALIDATION_ERROR
 *   when a line is unticked.
 */
async function assertMaySign(
  profile: SigningProfile,
  request: SigningRequest,
): Promise<ContractDocument> {
  const standing = await loadContractStanding(profile.tenantId, profile.kind);
  if (!canSignContract(standing)) {
    throw conflictError("Não há contrato para assinar agora. Recarregue a página.");
  }
  const contract = contractFor(profile.kind);
  if (request.version !== contract.version) {
    throw conflictError("O contrato foi atualizado. Recarregue a página para ler a versão nova.");
  }
  const unchecked = uncheckedSummaryItems(contract, request.confirmedItemIds);
  if (unchecked.length > 0) {
    throw validationError("Marque cada item do resumo para continuar.", unchecked);
  }
  return contract;
}

/**
 * E-mails a new code to the person's address and says where it went.
 *
 * @throws {AppError} RATE_LIMITED when asked again within a minute or over the hourly limit.
 */
export async function requestSigningCode(
  profile: SigningProfile,
  request: SigningRequest,
): Promise<{ sentTo: string }> {
  const contract = await assertMaySign(profile, request);
  const { email } = await signerIdentity(profile);
  const code = newSigningCode();
  const issued = await issueSigningCode(database, {
    userId: profile.userId,
    tenantId: profile.tenantId,
    kind: profile.kind,
    version: contract.version,
    codeHash: signingCodeHash(profile.userId, code),
    now: new Date(),
  });
  if (issued.kind === "wait") {
    throw rateLimitedError(`Aguarde ${issued.seconds} segundos para pedir outro código.`);
  }
  if (issued.kind === "hourly_limit") {
    throw rateLimitedError("Você pediu muitos códigos. Tente de novo daqui a uma hora.");
  }
  const rendered = contractCodeEmail({ code, contractTitle: contract.title }, environment.APP_URL);
  await sendCodeOrDiscard({ to: email, category: "account_access", ...rendered }, issued.codeId);
  await retireEarlierSigningCodes(database, {
    userId: profile.userId,
    keepCodeId: issued.codeId,
    now: new Date(),
  });
  logger.info("contract.code_sent", { tenantId: profile.tenantId, kind: profile.kind });
  return { sentTo: maskEmail(email) };
}

/**
 * Sends the code; when the e-mail fails the code is discarded, so the person is not left waiting
 * a minute for a code that never arrived, and the earlier one keeps working.
 */
async function sendCodeOrDiscard(email: OutgoingEmail, codeId: string): Promise<void> {
  try {
    await sendEmail(email);
  } catch (error) {
    await discardSigningCode(database, codeId);
    logger.warn("contract.code_email_failed", { error });
    throw error;
  }
}

interface SignerIdentity {
  name: string;
  email: string;
  cpf: string | null;
  cnpj: string | null;
  companyName: string | null;
  phone: string | null;
}

/** Who signed, as the account and the profile say at this moment. */
async function signerIdentity(profile: SigningProfile): Promise<SignerIdentity> {
  const account = await getSigningAccount(database, profile);
  if (account === null) {
    throw notFoundError("Conta não encontrada");
  }
  return {
    name: account.fullName ?? account.accountName,
    email: account.email,
    cpf: account.cpf,
    cnpj: account.cnpj,
    companyName: account.companyName,
    phone: account.phone,
  };
}

export interface SigningContext {
  request: Request;
  timeZone: string;
}

async function signatureEvidence(
  profile: SigningProfile,
  contract: ContractDocument,
  confirmedItemIds: readonly string[],
  context: SigningContext,
): Promise<ContractSignatureEvidence> {
  const identity = await signerIdentity(profile);
  const ipAddress = clientAddress(context.request, environment.CLIENT_IP_HEADER);
  const rawUserAgent = context.request.headers.get("user-agent");
  const userAgent = rawUserAgent === null ? null : rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH);
  const device = describeUserAgent(userAgent);
  const confirmed = new Set(confirmedItemIds);
  return {
    contractHash: contractFingerprint(contract),
    confirmedItemIds: contract.summary.map((item) => item.id).filter((id) => confirmed.has(id)),
    signerIdentityEnc: tokenCipher.encrypt(JSON.stringify(identity)),
    ipAddressEnc: ipAddress === null ? null : tokenCipher.encrypt(ipAddress),
    userAgent,
    deviceType: device.deviceType,
    browser: device.browser,
    timeZone: context.timeZone,
  };
}

/**
 * Checks the code and records the signature with its proof.
 *
 * @throws {AppError} VALIDATION_ERROR for a wrong, expired or spent code, saying what to do.
 */
export async function signContract(
  profile: SigningProfile,
  request: SigningRequest & { code: string },
  context: SigningContext,
): Promise<{ signedAt: string }> {
  const contract = await assertMaySign(profile, request);
  const evidence = await signatureEvidence(profile, contract, request.confirmedItemIds, context);
  const result = await signContractWithCode(database, {
    userId: profile.userId,
    tenantId: profile.tenantId,
    kind: profile.kind,
    version: contract.version,
    now: new Date(),
    codeMatches: codeMatcher(profile.userId, request.code),
    evidence,
  });
  if (result.kind !== "signed") {
    throw validationError(codeRefusalMessage(result));
  }
  logger.info("contract.signed", {
    tenantId: profile.tenantId,
    kind: profile.kind,
    version: contract.version,
  });
  return { signedAt: result.signedAt.toISOString() };
}

/** What the screen says when the code is refused, with the way out. */
export function codeRefusalMessage(
  result: Exclude<SignContractResult, { kind: "signed" }>,
): string {
  if (result.kind !== "wrong_code") {
    return SPENT_CODE_MESSAGES[result.kind];
  }
  if (result.attemptsLeft === 0) {
    return "Código errado. Toque em “Enviar outro código” para receber um novo.";
  }
  return `Código errado. Confira o e-mail e tente de novo (${attemptsLeftLabel(result.attemptsLeft)}).`;
}

const SPENT_CODE_MESSAGES = {
  no_code: "Este código não vale mais. Toque em “Enviar outro código” para receber um novo.",
  expired: "Este código venceu. Toque em “Enviar outro código” para receber um novo.",
  too_many_attempts:
    "Código errado muitas vezes. Toque em “Enviar outro código” para receber um novo.",
} as const satisfies Record<Exclude<SignContractResult["kind"], "signed" | "wrong_code">, string>;

function attemptsLeftLabel(attemptsLeft: number): string {
  if (attemptsLeft === 1) {
    return "1 tentativa restante";
  }
  return `${attemptsLeft} tentativas restantes`;
}
