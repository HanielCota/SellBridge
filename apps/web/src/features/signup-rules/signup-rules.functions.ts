import { getSignupRulesSince, setSignupRules } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";

/** Since when the contract sign-up rules apply, as ISO text; null while off. */
export const getSignupRulesFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => {
    const since = await getSignupRulesSince(database);
    return since === null ? null : since.toISOString();
  });

export const saveSignupRulesFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ context, data }) => {
    const since = await setSignupRules(database, {
      enabled: data.enabled,
      userId: context.userId,
      now: new Date(),
    });
    return since === null ? null : since.toISOString();
  });
