/**
 * The sale's page in the marketplace's seller area, or null when there is none to open (a
 * simulated store, or an order number that is not one). Mercado Livre's address is still to be
 * confirmed with the test account (docs/marketplaces/mercado-livre.md).
 */
export function marketplaceOrderUrl(marketplace: string, externalOrderId: string): string | null {
  if (marketplace !== "mercado_livre" || !/^\d+$/.test(externalOrderId)) return null;
  return `https://www.mercadolivre.com.br/vendas/${externalOrderId}/detalhe`;
}
