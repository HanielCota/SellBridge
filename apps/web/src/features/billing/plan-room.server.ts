import { billingUsage, findBillingAccess } from "@sellbridge/database/repositories";
import { database } from "@/lib/server/database";
import { billingRules } from "./billing-config.server";
import { type PlanRoom, planRoomOf } from "./plan-room";

/** The plan's room for an account: allowed, used and left. */
export async function findPlanRoom(tenantId: string): Promise<PlanRoom> {
  const rules = billingRules();
  const [access, usage] = await Promise.all([
    rules === null ? null : findBillingAccess(database, tenantId, rules),
    billingUsage(database, tenantId),
  ]);
  return planRoomOf(access, usage);
}
