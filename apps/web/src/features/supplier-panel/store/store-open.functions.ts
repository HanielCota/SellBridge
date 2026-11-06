import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supplierPanelMiddleware } from "@/lib/server/middleware";
import { writeStoreOpen } from "./store-open.server";

const storeOpenInputSchema = z.object({
  supplierId: z.uuid({ error: "Fornecedor inválido" }),
  open: z.boolean({ error: "Diga se a loja abre ou fecha." }),
});

/** The supplier (or the team on its behalf) opens or closes its own store for sales. */
export const setStoreOpenFn = createServerFn({ method: "POST" })
  .middleware([supplierPanelMiddleware])
  .validator(storeOpenInputSchema)
  .handler(
    async ({ data, context }) => await writeStoreOpen({ ...data, actor: context.viewer.kind }),
  );
