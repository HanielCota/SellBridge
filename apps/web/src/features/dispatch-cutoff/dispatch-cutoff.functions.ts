import {
  getDispatchCutoffSettings,
  setDispatchCutoffSettings,
  type DispatchCutoffSettings,
} from "@sellbridge/database/repositories";
import { dispatchCutoffSettingsSchema, formatCutoffTime } from "@sellbridge/shared/dispatch-cutoff";
import { logger } from "@sellbridge/shared/logger";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";

/** The rule as the settings form shows it: the switch, since when, and each time as "HH:MM". */
function cutoffView(settings: DispatchCutoffSettings) {
  return {
    enabled: settings.since !== null,
    since: settings.since,
    mercadoLivre: formatCutoffTime(settings.mercadoLivreMinutes),
    shopee: formatCutoffTime(settings.shopeeMinutes),
    tiktokShop: formatCutoffTime(settings.tiktokShopMinutes),
  };
}

export const getDispatchCutoffFn = createServerFn({ method: "GET" })
  .middleware([staffMiddleware("settings.manage")])
  .handler(async () => cutoffView(await getDispatchCutoffSettings(database)));

export const saveDispatchCutoffFn = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("settings.manage")])
  .validator(dispatchCutoffSettingsSchema)
  .handler(async ({ context, data }) => {
    const saved = await setDispatchCutoffSettings(database, {
      ...data,
      userId: context.userId,
      now: new Date(),
    });
    logger.info("dispatch_cutoff.saved", {
      enabled: saved.since !== null,
      mercadoLivreMinutes: saved.mercadoLivreMinutes,
      shopeeMinutes: saved.shopeeMinutes,
      tiktokShopMinutes: saved.tiktokShopMinutes,
      staffId: context.userId,
    });
    return cutoffView(saved);
  });
