import { queryOptions, useQuery } from "@tanstack/react-query";
import type { MercadoLivreRatesReading } from "./mercado-livre-rates.server";
import {
  getListingMercadoLivreRates,
  getProductMercadoLivreRates,
} from "./mercado-livre-rates.functions";

/** The server keeps the answers a day; an hour on screen spares asking it on every open. */
const RATES_STALE_MILLISECONDS = 60 * 60 * 1000;

export const productMercadoLivreRatesQueryOptions = (
  productId: string,
  storeIds: readonly string[],
) =>
  queryOptions({
    queryKey: ["mercado-livre-rates", "product", productId, storeIds.toSorted()],
    queryFn: () => getProductMercadoLivreRates({ data: { productId, storeIds: [...storeIds] } }),
    staleTime: RATES_STALE_MILLISECONDS,
  });

export const listingMercadoLivreRatesQueryOptions = (listingId: string) =>
  queryOptions({
    queryKey: ["mercado-livre-rates", "listing", listingId],
    queryFn: () => getListingMercadoLivreRates({ data: { listingId } }),
    staleTime: RATES_STALE_MILLISECONDS,
  });

/**
 * The store's own Mercado Livre costs while they load or when they cannot be read are null: the
 * screens keep showing the estimate meanwhile.
 */
export function useProductMercadoLivreRates(
  productId: string,
  storeIds: readonly string[],
): MercadoLivreRatesReading | null {
  return (
    useQuery({
      ...productMercadoLivreRatesQueryOptions(productId, storeIds),
      enabled: storeIds.length > 0,
    }).data ?? null
  );
}

export function useListingMercadoLivreRates(
  listingId: string,
  enabled: boolean,
): MercadoLivreRatesReading | null {
  return useQuery({ ...listingMercadoLivreRatesQueryOptions(listingId), enabled }).data ?? null;
}
