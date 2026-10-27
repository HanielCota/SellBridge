import { stateSchema } from "@sellbridge/shared/brazilian-states";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { listCitiesOfState } from "./ibge-cities.server";

/** The chosen state's cities, so the billing city can be picked instead of typed. */
export const getStateCities = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ state: stateSchema }))
  .handler(async ({ data }): Promise<readonly string[]> => listCitiesOfState(data.state));
