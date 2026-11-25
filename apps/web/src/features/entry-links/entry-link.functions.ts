import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { ENTRY_CHOICE_COOKIE } from "@/features/developer-api/entry-link-token.server";
import { tenantMiddleware } from "@/lib/server/middleware";
import { type EntryLinkView, openEntryLinkFor } from "./open-entry-link.server";

/** Set by the click route when the link handed over no choice. */
export const entryLinkSituationSchema = z.enum(["invalido", "vencido", "usado"]);

const VIEW_BY_SITUATION = {
  invalido: { kind: "invalid" },
  vencido: { kind: "expired" },
  usado: { kind: "used" },
} as const satisfies Record<z.infer<typeof entryLinkSituationSchema>, EntryLinkView>;

export const openEntryLink = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ situacao: entryLinkSituationSchema.optional() }))
  .handler(async ({ context, data }): Promise<EntryLinkView> => {
    if (data.situacao !== undefined) {
      return VIEW_BY_SITUATION[data.situacao];
    }
    return openEntryLinkFor(context, getCookie(ENTRY_CHOICE_COOKIE), new Date());
  });
