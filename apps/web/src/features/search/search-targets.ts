/** Where each kind of global search result leads when picked in the command palette. */
export const searchResultHref = {
  product: (product: { id: string }) => `/publicacoes/nova?productId=${product.id}`,
  listing: (listing: { title: string }) =>
    `/publicacoes?query=${encodeURIComponent(listing.title)}`,
  order: (order: { externalOrderId: string }) =>
    `/financeiro?query=${encodeURIComponent(order.externalOrderId)}`,
} as const;
