import { searchEverything } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { freeText } from "@sellbridge/shared/schemas";

export const searchEverythingFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ query: freeText().trim().min(2).max(100) }))
  .handler(async ({ context, data }) => searchEverything(database, context.tenantId, data.query));
