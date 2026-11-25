import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { tenantMiddleware } from "@/lib/server/middleware";
import { type EntryLinkView, openEntryLinkFor } from "./open-entry-link.server";

export const openEntryLink = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ token: z.string().max(100) }))
  .handler(async ({ context, data }): Promise<EntryLinkView> =>
    openEntryLinkFor(context, data, new Date()),
  );
