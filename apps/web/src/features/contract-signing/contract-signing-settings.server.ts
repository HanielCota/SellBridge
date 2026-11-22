import {
  countProfilesWithoutSignature,
  getContractSigningRequiredSince,
  setContractSigningRequired,
} from "@sellbridge/database/repositories";
import { contractFor } from "@sellbridge/shared/contract-documents";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

export interface ContractSigningSettingsView {
  required: boolean;
  /** ISO instant the switch was turned on, or null while off. */
  requiredSince: string | null;
  sellersWithoutSignature: number;
  suppliersWithoutSignature: number;
}

export async function loadContractSigningSettings(): Promise<ContractSigningSettingsView> {
  const [requiredSince, sellersWithoutSignature, suppliersWithoutSignature] = await Promise.all([
    getContractSigningRequiredSince(database),
    countProfilesWithoutSignature(database, {
      kind: "seller",
      version: contractFor("seller").version,
    }),
    countProfilesWithoutSignature(database, {
      kind: "supplier",
      version: contractFor("supplier").version,
    }),
  ]);
  return {
    required: requiredSince !== null,
    requiredSince: requiredSince === null ? null : requiredSince.toISOString(),
    sellersWithoutSignature,
    suppliersWithoutSignature,
  };
}

export async function saveContractSigningSettings(input: {
  required: boolean;
  userId: string;
}): Promise<ContractSigningSettingsView> {
  await setContractSigningRequired(database, { ...input, now: new Date() });
  logger.info("contract.signing_switch_saved", { required: input.required, userId: input.userId });
  return loadContractSigningSettings();
}
