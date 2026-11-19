import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { staffMiddleware } from "@/lib/server/middleware";
import { loadReceivingRules, saveReceivingRules } from "./receiving-rules.server";

export const getReceivingRulesFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => await loadReceivingRules());

export const saveReceivingRulesFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(
    z.object({ requireReceivingAccount: z.boolean(), paymentBeforePreparing: z.boolean() }),
  )
  .handler(
    async ({ data, context }) =>
      await saveReceivingRules({
        requireReceivingAccount: data.requireReceivingAccount,
        paymentBeforePreparing: data.paymentBeforePreparing,
        userId: context.userId,
      }),
  );
