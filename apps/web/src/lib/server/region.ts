import { findTenantRegion, type TenantRegion } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { database } from "./database.ts";

/** Loads the tenant region or fails with a message that leads the user to onboarding. */
export async function requireTenantRegion(tenantId: string): Promise<TenantRegion> {
  const region = await findTenantRegion(database, tenantId);
  if (!region) {
    throw forbiddenError("Informe seu CEP para ver os fornecedores da sua região");
  }
  return region;
}
