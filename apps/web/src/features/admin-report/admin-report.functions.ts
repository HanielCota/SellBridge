import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { serveMonthlyReport } from "@/features/report-kit/report-snapshot.server";
import { staffMiddleware } from "@/lib/server/middleware";
import { computeAdminReport } from "./admin-report.server";

/** The platform's support report: one per month for the whole team, kept once the month closes. */
export const getAdminMonthlyReport = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("support.metrics")])
  .validator(reportPeriodSearchSchema)
  .handler(async ({ data }) => {
    const now = new Date();
    const period = resolveReportPeriod(data, now);
    return serveMonthlyReport({
      scope: "admin",
      ownerId: "platform",
      period,
      now,
      compute: () => computeAdminReport(period, now),
    });
  });
