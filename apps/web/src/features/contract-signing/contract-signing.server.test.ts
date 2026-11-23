import { contractFor } from "@sellbridge/shared/contract-documents";
import { contractFingerprint } from "@sellbridge/shared/contract-fingerprint";
import type {
  discardSigningCode,
  getLiveSigningCodeSentAt,
  getSigningAccount,
  issueSigningCode,
  retireEarlierSigningCodes,
  signContractWithCode,
} from "@sellbridge/database/repositories";
import type { OutgoingEmail } from "@sellbridge/shared/mailer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requiredSince: vi.fn<() => Promise<Date | null>>(),
  hasSigned: vi.fn<() => Promise<boolean>>(),
  createdAt: vi.fn<() => Promise<Date | null>>(),
  account: vi.fn<typeof getSigningAccount>(),
  issue: vi.fn<typeof issueSigningCode>(),
  sign: vi.fn<typeof signContractWithCode>(),
  discard: vi.fn<typeof discardSigningCode>(),
  retire: vi.fn<typeof retireEarlierSigningCodes>(),
  send: vi.fn<(email: OutgoingEmail) => Promise<void>>(),
  liveCodeSentAt: vi.fn<typeof getLiveSigningCodeSentAt>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  getContractSigningRequiredSince: mocks.requiredSince,
  hasSignedContract: mocks.hasSigned,
  getProfileCreatedAt: mocks.createdAt,
  getSigningAccount: mocks.account,
  issueSigningCode: mocks.issue,
  signContractWithCode: mocks.sign,
  discardSigningCode: mocks.discard,
  retireEarlierSigningCodes: mocks.retire,
  getLiveSigningCodeSentAt: mocks.liveCodeSentAt,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://app.sellbridge.test",
    BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-chars",
    CLIENT_IP_HEADER: "x-forwarded-for",
  },
}));
vi.mock("@/lib/server/mailer", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/server/marketplaces", () => ({
  tokenCipher: { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value },
}));
const {
  contractStandingUnderSwitch,
  loadContractStanding,
  pendingSigningCode,
  requestSigningCode,
  signContract,
} = await import("./contract-signing.server");

const PROFILE = { userId: "user-1", tenantId: "tenant-1", kind: "seller" as const };
const CONTRACT = contractFor("seller");
const ALL_ITEMS = CONTRACT.summary.map((item) => item.id);
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function signingRequest(): Request {
  return new Request("https://app.sellbridge.test/_serverFn/sign", {
    method: "POST",
    headers: { "user-agent": IPHONE, "x-forwarded-for": "203.0.113.7" },
  });
}

/** The code e-mailed by the last request, read from the body (never the subject). */
function emailedCode(): string {
  const [email] = mocks.send.mock.calls.at(-1) ?? [];
  const code = email?.text.match(/\d{6}/)?.[0];
  if (code === undefined) {
    throw new Error("No code was e-mailed");
  }
  return code;
}

/** The HMAC stored by the last issue, as the database would keep it. */
function storedHash(): string {
  const input = mocks.issue.mock.calls.at(-1)?.[1];
  if (input === undefined) {
    throw new Error("No code was issued");
  }
  return input.codeHash;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requiredSince.mockResolvedValue(new Date("2026-12-01T12:00:00Z"));
  mocks.hasSigned.mockResolvedValue(false);
  mocks.createdAt.mockResolvedValue(new Date("2026-01-01T00:00:00Z"));
  mocks.account.mockResolvedValue({
    accountName: "Maria",
    email: "maria@loja.com.br",
    fullName: "Maria da Silva",
    cpf: "52998224725",
    cnpj: null,
    companyName: null,
    phone: "11912345678",
  });
  mocks.issue.mockResolvedValue({ kind: "issued", codeId: "code-new", expiresAt: new Date() });
  mocks.discard.mockResolvedValue();
  mocks.retire.mockResolvedValue();
  mocks.send.mockResolvedValue();
  mocks.liveCodeSentAt.mockResolvedValue(null);
});

describe("loadContractStanding", () => {
  it("reads only the switch while it is off", async () => {
    mocks.requiredSince.mockResolvedValue(null);

    await expect(loadContractStanding("tenant-1", "seller")).resolves.toEqual({
      kind: "not_required",
    });
    expect(mocks.hasSigned).not.toHaveBeenCalled();
  });
});

describe("contractStandingUnderSwitch", () => {
  it("reads nothing about the profile while the switch is off", async () => {
    const standing = await contractStandingUnderSwitch({
      tenantId: "tenant-1",
      kind: "seller",
      requiredSince: null,
    });

    expect(standing).toEqual({ kind: "not_required" });
    expect(mocks.requiredSince).not.toHaveBeenCalled();
    expect(mocks.hasSigned).not.toHaveBeenCalled();
    expect(mocks.createdAt).not.toHaveBeenCalled();
  });

  it("uses the switch it was given instead of reading it again", async () => {
    const standing = await contractStandingUnderSwitch({
      tenantId: "tenant-1",
      kind: "seller",
      requiredSince: new Date("2026-12-01T12:00:00Z"),
      now: new Date("2026-12-02T12:00:00Z"),
    });

    expect(standing.kind).toBe("grace");
    expect(mocks.requiredSince).not.toHaveBeenCalled();
  });
});

describe("pendingSigningCode", () => {
  it("brings back the code step after a reload while the last code still works, sending nothing", async () => {
    const now = new Date("2026-12-02T12:00:30Z");
    mocks.liveCodeSentAt.mockResolvedValue(new Date("2026-12-02T12:00:00Z"));

    const pending = await pendingSigningCode(PROFILE, now);

    expect(pending).toEqual({
      sentTo: expect.stringContaining("@loja.com.br"),
      resendWaitInSeconds: 30,
    });
    expect(pending?.sentTo).not.toBe("maria@loja.com.br");
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("opens on the summary when no code can still be typed", async () => {
    mocks.liveCodeSentAt.mockResolvedValue(null);

    await expect(pendingSigningCode(PROFILE, new Date("2026-12-02T12:00:00Z"))).resolves.toBeNull();
  });

  it("looks for no code while signing is not open", async () => {
    mocks.requiredSince.mockResolvedValue(null);

    await expect(pendingSigningCode(PROFILE)).resolves.toBeNull();
    expect(mocks.liveCodeSentAt).not.toHaveBeenCalled();
  });
});

describe("requestSigningCode", () => {
  it("e-mails a six-digit code and stores only its HMAC", async () => {
    const sent = await requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: ALL_ITEMS,
    });

    expect(sent).toEqual({ sentTo: "m***@loja.com.br" });
    expect(mocks.send.mock.calls[0]?.[0].to).toBe("maria@loja.com.br");
    // The general allowance: signing codes never use up anyone's password recovery.
    expect(mocks.send.mock.calls[0]?.[0].category).toBe("general");
    expect(storedHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash()).not.toContain(emailedCode());
  });

  it("retires the earlier codes only after the e-mail went out", async () => {
    await requestSigningCode(PROFILE, { version: CONTRACT.version, confirmedItemIds: ALL_ITEMS });

    expect(mocks.retire).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ keepCodeId: "code-new" }),
    );
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it("discards the new code when the e-mail fails, keeping the earlier one", async () => {
    mocks.send.mockRejectedValue(new Error("Resend fora do ar"));

    const request = requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: ALL_ITEMS,
    });

    await expect(request).rejects.toThrow("Resend fora do ar");
    expect(mocks.discard).toHaveBeenCalledWith({}, "code-new");
    expect(mocks.retire).not.toHaveBeenCalled();
  });

  it("refuses with an unticked line, naming it, and sends nothing", async () => {
    const [first, ...rest] = ALL_ITEMS;

    const request = requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: rest,
    });

    await expect(request).rejects.toMatchObject({
      message: "Marque cada item do resumo para continuar.",
      details: { issues: [first] },
    });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses when the contract on screen is an old version", async () => {
    const request = requestSigningCode(PROFILE, { version: "old", confirmedItemIds: ALL_ITEMS });

    await expect(request).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses while the switch is off", async () => {
    mocks.requiredSince.mockResolvedValue(null);

    const request = requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: ALL_ITEMS,
    });

    await expect(request).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("stops after five codes in 24 hours, pointing to support", async () => {
    mocks.issue.mockResolvedValue({ kind: "daily_limit" });

    const request = requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: ALL_ITEMS,
    });

    await expect(request).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message:
        "Você já pediu 5 códigos nas últimas 24 horas. Tente de novo mais tarde ou fale com o suporte.",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("says how long to wait when asked again too soon", async () => {
    mocks.issue.mockResolvedValue({ kind: "wait", seconds: 42 });

    const request = requestSigningCode(PROFILE, {
      version: CONTRACT.version,
      confirmedItemIds: ALL_ITEMS,
    });

    await expect(request).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Aguarde 42 segundos para pedir outro código.",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

/** Asks a code, then signs typing what `typed` makes of the e-mailed one. */
async function signWith(typed: (code: string) => string) {
  await requestSigningCode(PROFILE, { version: CONTRACT.version, confirmedItemIds: ALL_ITEMS });
  const hash = storedHash();
  mocks.sign.mockImplementation(async (_database, input) =>
    input.codeMatches(hash)
      ? { kind: "signed" as const, signedAt: new Date("2026-12-02T15:00:00Z") }
      : { kind: "wrong_code" as const, attemptsLeft: 4 },
  );
  return signContract(
    PROFILE,
    { version: CONTRACT.version, confirmedItemIds: ALL_ITEMS, code: typed(emailedCode()) },
    { request: signingRequest(), timeZone: "America/Sao_Paulo" },
  );
}

const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");

describe("signContract", () => {
  it("records the full proof: IP, device, browser, time zone, version and text hash", async () => {
    const signed = await signWith((code) => code);

    const input = mocks.sign.mock.calls[0]?.[1];
    expect(signed).toEqual({ signedAt: "2026-12-02T15:00:00.000Z" });
    expect(input).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "seller",
      version: CONTRACT.version,
      evidence: {
        contractHash: contractFingerprint(CONTRACT),
        confirmedItemIds: ALL_ITEMS,
        ipAddressEnc: "enc:203.0.113.7",
        userAgent: IPHONE,
        deviceType: "mobile",
        browser: "Safari",
        timeZone: "America/Sao_Paulo",
      },
    });
    const identity: unknown = JSON.parse(
      input?.evidence.signerIdentityEnc.replace(/^enc:/, "") ?? "null",
    );
    expect(identity).toEqual({
      name: "Maria da Silva",
      email: "maria@loja.com.br",
      cpf: "52998224725",
      cnpj: null,
      companyName: null,
      phone: "11912345678",
    });
  });

  it("refuses a wrong code and says how many tries are left", async () => {
    await expect(signWith(wrongCode)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Código errado. Confira o e-mail e tente de novo (4 tentativas restantes).",
    });
  });
});
