import { describe, expect, it } from "vitest";
import { contractFor } from "../domain/contract-documents.ts";
import { PROFILE_KINDS } from "../domain/profile-kind.ts";
import { contractFingerprint } from "./contract-fingerprint.ts";

// Contracts, section 2: each signature keeps the hash of the exact text accepted.
describe("contractFingerprint", () => {
  it("is a SHA-256 in hex and the same for the same text", () => {
    const contract = contractFor("supplier");

    expect(contractFingerprint(contract)).toMatch(/^[0-9a-f]{64}$/);
    expect(contractFingerprint(contract)).toBe(contractFingerprint(structuredClone(contract)));
  });

  it("changes when one word of the full text changes", () => {
    const contract = contractFor("seller");
    const [firstSection, ...otherSections] = contract.sections;
    if (firstSection === undefined) {
      throw new Error("The seller contract has no sections");
    }
    const edited = {
      ...contract,
      sections: [{ ...firstSection, paragraphs: ["Texto alterado."] }, ...otherSections],
    };

    expect(contractFingerprint(edited)).not.toBe(contractFingerprint(contract));
  });

  it("changes when a summary line changes", () => {
    const contract = contractFor("seller");
    const edited = {
      ...contract,
      summary: contract.summary.map((item, index) =>
        index === 0 ? { ...item, text: `${item.text} Alterado.` } : item,
      ),
    };

    expect(contractFingerprint(edited)).not.toBe(contractFingerprint(contract));
  });
});

describe("contract documents", () => {
  it.each(PROFILE_KINDS)(
    "gives the %s contract unique summary ids and a valid start date",
    (kind) => {
      const contract = contractFor(kind);
      const ids = contract.summary.map((item) => item.id);

      expect(contract.kind).toBe(kind);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(Number.isNaN(new Date(contract.effectiveAt).getTime())).toBe(false);
      expect(contract.sections.length).toBeGreaterThan(0);
    },
  );
});
