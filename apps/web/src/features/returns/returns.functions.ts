import {
  getReturnAnswerBusinessDays,
  listOrderReturns,
  markReturnArrivedAtSeller,
  markReturnReceivedBySupplier,
  recordReturnForward,
  reportReturnNotReceived,
  setReturnAnswerBusinessDays,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  answerBusinessDaysSchema,
  claimActionSchema,
  forwardSchema,
} from "@sellbridge/shared/return-policy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { accountMiddleware, staffMiddleware, tenantMiddleware } from "@/lib/server/middleware";

/** The reseller's returns of one order, for its order page. */
export const getOrderReturnsFn = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ orderId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await listOrderReturns(database, { tenantId: context.tenantId, orderId: data.orderId }),
  );

/** The reseller: the parcel came back to its own address. */
export const markReturnArrivedHereFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(claimActionSchema)
  .handler(async ({ context, data }) => {
    await markReturnArrivedAtSeller(database, {
      claimId: data.claimId,
      tenantId: context.tenantId,
    });
    return { ok: true };
  });

/** The reseller: the parcel went on to the supplier, with its tracking code. */
export const forwardReturnFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(forwardSchema)
  .handler(async ({ context, data }) => {
    await recordReturnForward(database, {
      claimId: data.claimId,
      tenantId: context.tenantId,
      trackingCode: data.trackingCode,
    });
    return { ok: true };
  });

/** Either side: the forwarded parcel reached the supplier. */
export const confirmReturnReceivedFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(claimActionSchema)
  .handler(async ({ context, data }) => {
    await markReturnReceivedBySupplier(database, {
      claimId: data.claimId,
      tenantId: context.tenantId,
    });
    return { ok: true };
  });

/** The supplier: the parcel never reached its address. */
export const reportReturnNotReceivedFn = createServerFn({ method: "POST" })
  .middleware([accountMiddleware])
  .validator(claimActionSchema)
  .handler(async ({ context, data }) => {
    await reportReturnNotReceived(database, { claimId: data.claimId, tenantId: context.tenantId });
    return { ok: true };
  });

export const getReturnAnswerDaysFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => ({ businessDays: await getReturnAnswerBusinessDays(database) }));

export const saveReturnAnswerDaysFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(answerBusinessDaysSchema)
  .handler(async ({ context, data }) => {
    const businessDays = await setReturnAnswerBusinessDays(database, {
      businessDays: data.businessDays,
      userId: context.userId,
    });
    logger.info("return_policy.answer_days_saved", { businessDays, staffId: context.userId });
    return { businessDays };
  });
