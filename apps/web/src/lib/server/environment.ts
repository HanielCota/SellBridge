import { installErrorAlerts } from "@sellbridge/shared/error-alerts";
import { parseEnvironment, retiredVariablesIn } from "@sellbridge/shared/environment";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { logger } from "@sellbridge/shared/logger";
import { type ServerEnvironment, serverEnvironmentSchema } from "./environment-schema.ts";

/**
 * SellBridge's fee is the admin's payment fee setting, paid by the supplier (17/11/2026); the old
 * reseller-side fee variable and its earlier name do nothing anymore.
 */
const RETIRED_VARIABLES = ["PLATFORM_FEE_BASIS_POINTS", "PLATFORM_FEE_BPS"] as const;

loadRootEnvironmentFile();

export type { ServerEnvironment };

export const environment: ServerEnvironment = parseEnvironment(
  serverEnvironmentSchema,
  process.env,
);

installErrorAlerts({ webhookUrl: environment.ALERT_WEBHOOK_URL, service: "web" });

for (const variable of retiredVariablesIn(process.env, RETIRED_VARIABLES)) {
  logger.warn("environment.retired_variable", {
    variable,
    replacement: "admin payment fee setting",
  });
}
