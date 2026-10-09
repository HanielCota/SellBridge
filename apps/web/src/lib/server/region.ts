import { findTenantRegion, type TenantRegion } from "@sellbridge/db/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { db } from "./db.ts";

/** Loads the tenant region or fails with a message that leads the user to onboarding. */
export async function requireTenantRegion(tenantId: string): Promise<TenantRegion> {
  const region = await findTenantRegion(db, tenantId);
  if (!region) {
    throw forbiddenError("Informe seu CEP para ver os fornecedores da sua região");
  }
  return region;
}
