/*
 * Prévia do link (Open Graph e X): o que aparece no WhatsApp e nas redes quando alguém manda um
 * endereço do app. As imagens ficam na landing (sellbridge.com.br), o site da marca, porque a prévia
 * precisa de URL absoluta e a landing já publica a imagem oficial.
 */
const BRAND_SITE = "https://sellbridge.com.br";

export const SHARE_IMAGES = {
  /** Cartão da marca (1200×630) para convites e cadastro. */
  brand: {
    url: `${BRAND_SITE}/brand/sellbridge-share-v1.jpg`,
    width: 1200,
    height: 630,
    alt: "SellBridge: revenda nos marketplaces sem ter estoque. Fornecedores perto de você no Mercado Livre, Shopee e TikTok Shop.",
  },
  /** Só o símbolo, para links operacionais (ex.: pedido do fornecedor) que não devem parecer propaganda. */
  symbol: {
    url: `${BRAND_SITE}/icon-512.png`,
    width: 512,
    height: 512,
    alt: "SellBridge",
  },
} as const;

type ShareImage = (typeof SHARE_IMAGES)[keyof typeof SHARE_IMAGES];

type PageShare = {
  title: string;
  description: string;
  image?: ShareImage;
};

/** Título, descrição e imagem da página, repetidos nas tags que o WhatsApp, as redes e o X leem. */
export function shareMeta({ title, description, image = SHARE_IMAGES.brand }: PageShare) {
  const card = image === SHARE_IMAGES.brand ? "summary_large_image" : "summary";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image.url },
    { property: "og:image:width", content: String(image.width) },
    { property: "og:image:height", content: String(image.height) },
    { property: "og:image:alt", content: image.alt },
    { name: "twitter:card", content: card },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image.url },
    { name: "twitter:image:alt", content: image.alt },
  ];
}

/** Tags fixas do site: valem para toda página, que só troca título, descrição e imagem. */
export const SITE_SHARE_META = [
  { property: "og:type", content: "website" },
  { property: "og:site_name", content: "SellBridge" },
  { property: "og:locale", content: "pt_BR" },
];
