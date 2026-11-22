import { DEFAULT_CUTOFF_MINUTES } from "@sellbridge/shared/dispatch-cutoff";
import { eq } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { platformSettings } from "../schema/index.ts";

/** The cutoff rule as the admin sees it; `since` is null while the rule is off. */
export interface DispatchCutoffSettings {
  since: Date | null;
  mercadoLivreMinutes: number;
  shopeeMinutes: number;
  tiktokShopMinutes: number;
}

const CUTOFF_OFF: DispatchCutoffSettings = {
  since: null,
  mercadoLivreMinutes: DEFAULT_CUTOFF_MINUTES.mercado_livre,
  shopeeMinutes: DEFAULT_CUTOFF_MINUTES.shopee,
  tiktokShopMinutes: DEFAULT_CUTOFF_MINUTES.tiktok_shop,
};

const cutoffColumns = {
  since: platformSettings.dispatchCutoffSince,
  mercadoLivreMinutes: platformSettings.mercadoLivreCutoffMinutes,
  shopeeMinutes: platformSettings.shopeeCutoffMinutes,
  tiktokShopMinutes: platformSettings.tiktokShopCutoffMinutes,
};

export async function getDispatchCutoffSettings(
  database: DatabaseExecutor,
): Promise<DispatchCutoffSettings> {
  const [row] = await database
    .select(cutoffColumns)
    .from(platformSettings)
    .where(eq(platformSettings.id, 1));
  return row ?? CUTOFF_OFF;
}

/**
 * Saves the admin's choice. Turning the rule on stamps `now`, so only parcels created from then
 * on get the posting date; a rule already on keeps its instant when only the times change. The
 * times are validated by `dispatchCutoffSettingsSchema` and by the table's check.
 */
export async function setDispatchCutoffSettings(
  database: Database,
  input: {
    enabled: boolean;
    mercadoLivre: number;
    shopee: number;
    tiktokShop: number;
    userId: string;
    now: Date;
  },
): Promise<DispatchCutoffSettings> {
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ since: platformSettings.dispatchCutoffSince })
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .for("update");
    const currentSince = current?.since ?? null;
    const since = input.enabled ? (currentSince ?? input.now) : null;
    const values = {
      dispatchCutoffSince: since,
      mercadoLivreCutoffMinutes: input.mercadoLivre,
      shopeeCutoffMinutes: input.shopee,
      tiktokShopCutoffMinutes: input.tiktokShop,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    };
    await transaction
      .insert(platformSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: platformSettings.id, set: values });
    return {
      since,
      mercadoLivreMinutes: input.mercadoLivre,
      shopeeMinutes: input.shopee,
      tiktokShopMinutes: input.tiktokShop,
    };
  });
}
