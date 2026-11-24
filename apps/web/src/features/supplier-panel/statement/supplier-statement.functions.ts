import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { supplierIdSchema } from "@sellbridge/shared/supplier-panel-orders-schema";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { STATEMENT_CURSOR_MAX_LENGTH } from "./statement-cursor";
import { loadStatementPage, loadStatementTotals } from "./supplier-statement.server";

const statementInputSchema = reportPeriodSearchSchema.extend({ supplierId: supplierIdSchema });

export const getSupplierStatementTotalsFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(statementInputSchema)
  .handler(async ({ data }) => {
    const { supplierId, ...search } = data;
    return loadStatementTotals({ supplierId, search, now: new Date() });
  });

export const listSupplierStatementLinesFn = createServerFn({ method: "GET" })
  .middleware([supplierPanelMiddleware])
  .validator(
    statementInputSchema.extend({
      cursor: z.string().max(STATEMENT_CURSOR_MAX_LENGTH).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supplierId, cursor, ...search } = data;
    return loadStatementPage({ supplierId, search, cursor, now: new Date() });
  });
