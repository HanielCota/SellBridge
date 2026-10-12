import { parseEnvironment } from "@sellbridge/shared/environment";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { type ServerEnvironment, serverEnvironmentSchema } from "./environment-schema.ts";

loadRootEnvironmentFile();

export type { ServerEnvironment };

export const environment: ServerEnvironment = parseEnvironment(
  serverEnvironmentSchema,
  process.env,
  { renamedVariables: { PLATFORM_FEE_BPS: "PLATFORM_FEE_BASIS_POINTS" } },
);
