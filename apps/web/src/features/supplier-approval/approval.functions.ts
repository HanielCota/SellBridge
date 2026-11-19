import {
  countSuppliersAwaitingTeam,
  decideSupplierApprovalByTeam,
  getRequireReceivingAccount,
  getSupplierApprovalState,
  listSuppliersAwaitingTeam,
  setRequireReceivingAccount,
} from "@sellbridge/database/repositories";
import {
  supplierApprovalDecisionSchema,
  supplierApprovalQueueSearchSchema,
} from "@sellbridge/shared/supplier-approval";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recordCatalogWrite } from "@/features/admin-audit/catalog-audit.server";
import { database } from "@/lib/server/database";
import { adminMiddleware, staffMiddleware } from "@/lib/server/middleware";

const QUEUE_PAGE_SIZE = 20;

/** "Fornecedores em análise": the suppliers the automatic check could not decide. */
export const adminListSupplierApprovalQueue = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(supplierApprovalQueueSearchSchema)
  .handler(async ({ data }) => {
    const { items, total } = await listSuppliersAwaitingTeam(database, {
      page: data.page,
      pageSize: QUEUE_PAGE_SIZE,
    });
    return {
      items,
      total,
      page: data.page,
      totalPages: Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE)),
    };
  });

export const adminCountSupplierApprovalQueue = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => await countSuppliersAwaitingTeam(database));

export const adminGetSupplierApproval = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(z.object({ supplierId: z.uuid() }))
  .handler(async ({ data }) => await getSupplierApprovalState(database, data.supplierId));

export const adminDecideSupplierApproval = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(supplierApprovalDecisionSchema)
  .handler(async ({ context, data }) => {
    const status = await decideSupplierApprovalByTeam(database, {
      ...data,
      userId: context.userId,
    });
    await recordCatalogWrite(context.userId, {
      entityType: "supplier",
      entityId: data.supplierId,
      action: data.decision === "approve" ? "supplier.approved" : "supplier.refused",
      details: {},
    });
    return status;
  });

export const getRequireReceivingAccountFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => await getRequireReceivingAccount(database));

export const saveRequireReceivingAccountFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(z.object({ required: z.boolean() }))
  .handler(
    async ({ context, data }) =>
      await setRequireReceivingAccount(database, {
        required: data.required,
        userId: context.userId,
      }),
  );
