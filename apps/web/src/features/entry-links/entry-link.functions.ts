import { listStoreConnections } from "@sellbridge/database/repositories";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import type { PublishStore } from "@/components/catalog/bulk-store-picker";
import type { PlanRoom } from "@/features/billing/plan-room";
import { findPlanRoom } from "@/features/billing/plan-room.server";
import { ENTRY_CHOICE_COOKIE } from "@/features/developer-api/entry-link-token.server";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { type EntryLinkView, openEntryLinkFor } from "./open-entry-link.server";

/** Set by the click route when the link handed over no choice. */
export const entryLinkSituationSchema = z.enum(["invalido", "vencido", "usado"]);

const VIEW_BY_SITUATION = {
  invalido: { kind: "invalid" },
  vencido: { kind: "expired" },
  usado: { kind: "used" },
} as const satisfies Record<z.infer<typeof entryLinkSituationSchema>, EntryLinkView>;

/** The page's data: a ready choice also brings what preparing its listings needs. */
export type EntryLinkPageData =
  | Exclude<EntryLinkView, { kind: "ready" }>
  | (Extract<EntryLinkView, { kind: "ready" }> & { stores: PublishStore[]; planRoom: PlanRoom });

/** Bulk publishing goes only to connected stores, as in the catalog. */
async function listPublishStores(tenantId: string): Promise<PublishStore[]> {
  const stores = await listStoreConnections(database, tenantId);
  return stores
    .filter((store) => store.status === "connected")
    .map((store) => ({
      id: store.id,
      shopName: store.shopName,
      marketplace: store.marketplace,
      supplierIds: store.supplierIds,
    }));
}

export const openEntryLink = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ situacao: entryLinkSituationSchema.optional() }))
  .handler(async ({ context, data }): Promise<EntryLinkPageData> => {
    if (data.situacao !== undefined) {
      return VIEW_BY_SITUATION[data.situacao];
    }
    const view = await openEntryLinkFor(context, getCookie(ENTRY_CHOICE_COOKIE), new Date());
    if (view.kind !== "ready") {
      return view;
    }
    const [stores, planRoom] = await Promise.all([
      listPublishStores(context.tenantId),
      findPlanRoom(context.tenantId),
    ]);
    return { ...view, stores, planRoom };
  });
