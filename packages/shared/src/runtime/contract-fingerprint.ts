import { createHash } from "node:crypto";
import type { ContractDocument } from "../domain/contract-documents.ts";

/**
 * SHA-256 (hex) of everything the person read: title, version, summary lines and full text.
 * Stored with each signature, it proves later which exact text was accepted; any change to the
 * words gives another hash. The JSON keeps a fixed key order, so the same text always hashes alike.
 */
export function contractFingerprint(contract: ContractDocument): string {
  const canonical = JSON.stringify({
    kind: contract.kind,
    version: contract.version,
    title: contract.title,
    summary: contract.summary.map((item) => ({ id: item.id, text: item.text })),
    sections: contract.sections.map((section) => ({
      title: section.title,
      paragraphs: [...section.paragraphs],
    })),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
