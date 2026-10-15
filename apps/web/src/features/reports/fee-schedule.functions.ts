import { createServerFn } from "@tanstack/react-start";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";
import { feeScheduleFrom } from "./fee-schedule";

/** The fees a price preview estimates, so the catalog and the financial page agree. */
export const getFeeSchedule = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async () => feeScheduleFrom(environment));
