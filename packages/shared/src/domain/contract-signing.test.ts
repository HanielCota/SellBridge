import { describe, expect, it } from "vitest";
import { CONTRACT_SIGNING_GRACE_DAYS, contractFor } from "./contract-documents.ts";
import {
  canSignContract,
  contractStanding,
  describeUserAgent,
  SIGNING_CODE_MAX_ATTEMPTS,
  signContractSchema,
  signerTimeZoneSchema,
  signingBlocksPanel,
  signingCodeResendWaitInSeconds,
  signingCodeSchema,
  signingCodeUsable,
  uncheckedSummaryItems,
} from "./contract-signing.ts";

const DAY_IN_MS = 86_400_000;
const SWITCH_ON = new Date("2026-12-01T12:00:00Z");
const CONTRACT = { effectiveAt: "2026-11-21T00:00:00Z" };

function standingAt(now: Date, overrides: Partial<Parameters<typeof contractStanding>[0]> = {}) {
  return contractStanding({
    requiredSince: SWITCH_ON,
    signedVersionInForce: false,
    profileCreatedAt: new Date("2026-01-10T00:00:00Z"),
    contract: CONTRACT,
    now,
    ...overrides,
  });
}

// Contracts, section 1 (Guilherme, 21/11/2026): nothing changes with the switch off; who already
// used SellBridge gets 30 days; a profile created after the switch signs before anything.
describe("contractStanding", () => {
  it("asks nothing while the switch is off, even without a signature", () => {
    expect(standingAt(new Date(), { requiredSince: null })).toEqual({ kind: "not_required" });
  });

  it("is signed once the version in force is signed", () => {
    expect(standingAt(SWITCH_ON, { signedVersionInForce: true })).toEqual({ kind: "signed" });
  });

  it("gives an existing profile 30 days from the switch", () => {
    const now = new Date(SWITCH_ON.getTime() + DAY_IN_MS);

    const standing = standingAt(now);

    expect(standing).toEqual({
      kind: "grace",
      deadline: new Date(SWITCH_ON.getTime() + CONTRACT_SIGNING_GRACE_DAYS * DAY_IN_MS),
    });
  });

  it("is overdue from the deadline on", () => {
    const deadline = new Date(SWITCH_ON.getTime() + CONTRACT_SIGNING_GRACE_DAYS * DAY_IN_MS);

    expect(standingAt(deadline)).toEqual({ kind: "overdue", deadline });
  });

  it("makes a profile created after the switch sign at once", () => {
    const created = new Date(SWITCH_ON.getTime() + 1000);

    expect(standingAt(created, { profileCreatedAt: created })).toEqual({ kind: "must_sign" });
  });

  it("counts the 30 days again from a new version taking effect after the switch", () => {
    const newVersion = { effectiveAt: "2027-03-01T00:00:00Z" };
    const now = new Date("2027-03-15T00:00:00Z");

    const standing = standingAt(now, { contract: newVersion });

    expect(standing).toEqual({
      kind: "grace",
      deadline: new Date(new Date(newVersion.effectiveAt).getTime() + 30 * DAY_IN_MS),
    });
  });

  it("throws on a contract whose start date does not parse", () => {
    expect(() => standingAt(SWITCH_ON, { contract: { effectiveAt: "21/11/2026" } })).toThrow(
      "Invalid contract effectiveAt",
    );
  });
});

describe("signingBlocksPanel", () => {
  const deadline = new Date();

  it("holds a new profile of either kind on the signing screen", () => {
    expect(signingBlocksPanel({ kind: "must_sign" }, "seller")).toBe(true);
    expect(signingBlocksPanel({ kind: "must_sign" }, "supplier")).toBe(true);
  });

  it("holds a seller past the deadline, but keeps the panel of a supplier who still ships", () => {
    expect(signingBlocksPanel({ kind: "overdue", deadline }, "seller")).toBe(true);
    expect(signingBlocksPanel({ kind: "overdue", deadline }, "supplier")).toBe(false);
  });

  it("never holds anyone during the 30 days, after signing or with the switch off", () => {
    expect(signingBlocksPanel({ kind: "grace", deadline }, "seller")).toBe(false);
    expect(signingBlocksPanel({ kind: "signed" }, "seller")).toBe(false);
    expect(signingBlocksPanel({ kind: "not_required" }, "seller")).toBe(false);
  });
});

describe("canSignContract", () => {
  it("opens signing only while there is something to sign", () => {
    expect(canSignContract({ kind: "must_sign" })).toBe(true);
    expect(canSignContract({ kind: "grace", deadline: new Date() })).toBe(true);
    expect(canSignContract({ kind: "signed" })).toBe(false);
    expect(canSignContract({ kind: "not_required" })).toBe(false);
  });
});

describe("uncheckedSummaryItems", () => {
  const contract = contractFor("seller");
  const allIds = contract.summary.map((item) => item.id);

  it("is empty when every line is ticked", () => {
    expect(uncheckedSummaryItems(contract, allIds)).toEqual([]);
  });

  it("lists the unticked lines in the contract's order", () => {
    const [first, second, ...rest] = allIds;

    expect(uncheckedSummaryItems(contract, rest)).toEqual([first, second]);
  });

  it("ignores ids that are not in the contract", () => {
    expect(uncheckedSummaryItems(contract, ["made-up", ...allIds])).toEqual([]);
  });
});

describe("signing codes", () => {
  const now = new Date("2026-12-01T12:00:00Z");
  const future = new Date(now.getTime() + 60_000);

  it("works while unspent, before expiry and under the try limit", () => {
    expect(signingCodeUsable({ expiresAt: future, attempts: 0, consumedAt: null }, now)).toBe(true);
  });

  it("stops working when expired, spent or out of tries", () => {
    expect(signingCodeUsable({ expiresAt: now, attempts: 0, consumedAt: null }, now)).toBe(false);
    expect(signingCodeUsable({ expiresAt: future, attempts: 0, consumedAt: now }, now)).toBe(false);
    const exhausted = { expiresAt: future, attempts: SIGNING_CODE_MAX_ATTEMPTS, consumedAt: null };
    expect(signingCodeUsable(exhausted, now)).toBe(false);
  });

  it("waits a minute before another code", () => {
    expect(signingCodeResendWaitInSeconds(null, now)).toBe(0);
    expect(signingCodeResendWaitInSeconds(new Date(now.getTime() - 15_000), now)).toBe(45);
    expect(signingCodeResendWaitInSeconds(new Date(now.getTime() - 90_000), now)).toBe(0);
  });

  it("accepts six digits only, saying what to type", () => {
    expect(signingCodeSchema.parse(" 012345 ")).toBe("012345");
    expect(signingCodeSchema.safeParse("12345").error?.issues[0]?.message).toBe(
      "Digite os 6 números do código enviado ao seu e-mail.",
    );
    expect(signingCodeSchema.safeParse("12a456").success).toBe(false);
  });
});

describe("signerTimeZoneSchema", () => {
  it("accepts an IANA time zone and refuses anything else", () => {
    expect(signerTimeZoneSchema.parse("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(signerTimeZoneSchema.safeParse("Mars/Olympus").success).toBe(false);
    expect(signerTimeZoneSchema.safeParse("").success).toBe(false);
  });
});

describe("signContractSchema", () => {
  it("caps the list of ticked lines", () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => `item-${index}`);

    const parsed = signContractSchema.safeParse({
      version: "v1",
      confirmedItemIds: tooMany,
      code: "123456",
      timeZone: "America/Sao_Paulo",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("describeUserAgent", () => {
  it("reads a phone, a tablet and a computer with their browser", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const androidTablet =
      "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const windowsEdge =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0";

    expect(describeUserAgent(iphone)).toEqual({ deviceType: "mobile", browser: "Safari" });
    expect(describeUserAgent(androidTablet)).toEqual({ deviceType: "tablet", browser: "Chrome" });
    expect(describeUserAgent(windowsEdge)).toEqual({ deviceType: "desktop", browser: "Edge" });
  });

  it("says unknown when the browser sent nothing", () => {
    expect(describeUserAgent(null)).toEqual({ deviceType: "unknown", browser: "unknown" });
    expect(describeUserAgent("  ")).toEqual({ deviceType: "unknown", browser: "unknown" });
  });
});
