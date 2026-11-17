import {
  findListingPricingScope,
  getSellableCatalogProduct,
} from "@sellbridge/database/repositories";
import { notFoundError } from "@sellbridge/shared/errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { readMercadoLivreRates } from "./mercado-livre-rates.server";

/** More stores than a reseller connects; past it the request is refused, not read store by store. */
const MAX_PRICED_STORES = 20;

/** The product's Mercado Livre costs on the chosen stores, for the new listing's preview. */
export const getProductMercadoLivreRates = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(
    z.object({
      productId: z.uuid(),
      storeIds: z.array(z.uuid()).max(MAX_PRICED_STORES),
    }),
  )
  .handler(async ({ context, data }) => {
    // Refuses a product the reseller cannot sell, before any marketplace is asked about it.
    await getSellableCatalogProduct(database, data.productId, context.tenantId);
    return readMercadoLivreRates(context.tenantId, data);
  });

/** A listing's Mercado Livre costs on its own stores, for the edit price dialog. */
export const getListingMercadoLivreRates = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(z.object({ listingId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const scope = await findListingPricingScope(database, context.tenantId, data.listingId);
    if (scope === null) {
      throw notFoundError("Publicação não encontrada");
    }
    return readMercadoLivreRates(context.tenantId, scope);
  });
