import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { resellerBlingSaveSchema } from "./reseller-bling-connection";
import {
  disconnectResellerBling,
  loadResellerBling,
  retryResellerSaleNote,
  saveResellerBling,
} from "./reseller-bling.server";

export const getResellerBling = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => loadResellerBling(context.tenantId));

export const saveResellerBlingFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(resellerBlingSaveSchema)
  .handler(async ({ context, data }) =>
    saveResellerBling({
      tenantId: context.tenantId,
      impersonatedBy: context.impersonatedBy,
      save: data,
    }),
  );

export const disconnectResellerBlingFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) =>
    disconnectResellerBling({
      tenantId: context.tenantId,
      impersonatedBy: context.impersonatedBy,
    }),
  );

export const retryResellerSaleNoteFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ shipmentId: z.uuid() }))
  .handler(async ({ context, data }) =>
    retryResellerSaleNote({ tenantId: context.tenantId, shipmentId: data.shipmentId }),
  );
