export const SELLER_PRODUCT_ACTION_LABELS: Readonly<Record<string, string>> = {
  "product.seller_updated": "Editou produto do cliente",
  "product.seller_activate": "Deixou produto do cliente pronto para publicar",
  "product.seller_archive": "Arquivou produto do cliente",
  "product.seller_block": "Bloqueou produto do cliente",
  "product.seller_unblock": "Removeu bloqueio do produto do cliente",
  "product.seller_image_uploaded": "Enviou imagem do produto do cliente",
  "product.publications_paused": "Pausou anúncios do cliente",
  "product.publications_resumed": "Reativou anúncios do cliente",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  created: "Cadastro inicial",
  sku: "Código (SKU)",
  title: "Nome do produto",
  description: "Descrição",
  categoryId: "Categoria",
  costCents: "Custo por unidade",
  suggestedPriceCents: "Preço de venda",
  stock: "Estoque total",
  imageUrls: "Imagens",
  attributes: "Dados do marketplace e embalagem",
  active: "Disponibilidade",
  reviewStatus: "Situação da análise",
};

/** Stored audit field keys stay unchanged; the interface renders their Portuguese names. */
export function productAuditFields(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split(",")
    .filter(Boolean)
    .map((field) => FIELD_LABELS[field] ?? "Outro campo")
    .join(", ");
}
