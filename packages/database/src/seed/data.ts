export interface SeedCategory {
  slug: string;
  name: string;
}

export const CATEGORIES: SeedCategory[] = [
  { slug: "moda-feminina", name: "Moda feminina" },
  { slug: "moda-masculina", name: "Moda masculina" },
  { slug: "calcados", name: "Calçados" },
  { slug: "acessorios", name: "Acessórios" },
  { slug: "beleza", name: "Beleza e cuidados" },
  { slug: "casa", name: "Casa e decoração" },
  { slug: "cozinha", name: "Cozinha" },
  { slug: "eletronicos", name: "Eletrônicos e acessórios" },
  { slug: "pet", name: "Pet shop" },
  { slug: "fitness", name: "Fitness" },
  { slug: "papelaria", name: "Papelaria" },
  { slug: "infantil", name: "Infantil e brinquedos" },
];

export interface ProductTemplate {
  title: string;
  category: string;
  /** Cost range in cents. */
  cost: [number, number];
}

export const NICHE_PRODUCTS: Record<string, ProductTemplate[]> = {
  "Moda feminina": [
    { title: "Vestido midi viscose estampado", category: "moda-feminina", cost: [3900, 6900] },
    { title: "Blusa de tricô canelada", category: "moda-feminina", cost: [2500, 4200] },
    { title: "Calça wide leg alfaiataria", category: "moda-feminina", cost: [4500, 7900] },
    { title: "Saia plissada midi", category: "moda-feminina", cost: [3200, 5500] },
    { title: "Conjunto cropped e short linho", category: "moda-feminina", cost: [5200, 8900] },
    { title: "Body manga longa canelado", category: "moda-feminina", cost: [2200, 3600] },
    { title: "Jaqueta jeans oversized", category: "moda-feminina", cost: [6900, 11_900] },
    { title: "Bolsa tiracolo couro sintético", category: "acessorios", cost: [3500, 6500] },
  ],
  "Moda masculina": [
    { title: "Camiseta algodão pima básica", category: "moda-masculina", cost: [2200, 3500] },
    { title: "Camisa polo piquet", category: "moda-masculina", cost: [3500, 5200] },
    { title: "Bermuda sarja com elastano", category: "moda-masculina", cost: [3900, 5900] },
    { title: "Calça jeans slim", category: "moda-masculina", cost: [5900, 8900] },
    { title: "Moletom canguru felpado", category: "moda-masculina", cost: [5500, 8500] },
    { title: "Tênis casual em lona", category: "calcados", cost: [6900, 9900] },
    { title: "Boné aba curva bordado", category: "acessorios", cost: [1800, 3200] },
  ],
  Calçados: [
    { title: "Rasteira trançada couro", category: "calcados", cost: [2900, 4900] },
    { title: "Tênis running amortecido", category: "calcados", cost: [8900, 14_900] },
    { title: "Sandália salto bloco", category: "calcados", cost: [4500, 6900] },
    { title: "Mocassim drive couro", category: "calcados", cost: [7900, 11_900] },
    { title: "Chinelo slide confort", category: "calcados", cost: [1500, 2900] },
    { title: "Bota coturno tratorada", category: "calcados", cost: [9900, 14_900] },
  ],
  Cosméticos: [
    { title: "Sérum facial vitamina C 30 ml", category: "beleza", cost: [1900, 3500] },
    { title: "Kit shampoo e condicionador vegano", category: "beleza", cost: [2500, 4200] },
    { title: "Máscara capilar nutrição 300 g", category: "beleza", cost: [1500, 2800] },
    { title: "Protetor solar facial FPS 50", category: "beleza", cost: [2200, 3900] },
    { title: "Óleo corporal amêndoas 200 ml", category: "beleza", cost: [1200, 2200] },
    { title: "Paleta de sombras 12 cores", category: "beleza", cost: [1800, 3200] },
    { title: "Hidratante labial FPS 15", category: "beleza", cost: [500, 1100] },
  ],
  "Casa e decoração": [
    { title: "Jogo de cama queen 200 fios", category: "casa", cost: [7900, 12_900] },
    { title: "Manta de sofá tricô", category: "casa", cost: [5500, 8900] },
    { title: "Kit 4 almofadas linho", category: "casa", cost: [4500, 7500] },
    { title: "Vaso cerâmica artesanal", category: "casa", cost: [2500, 4500] },
    { title: "Organizador de gavetas 6 peças", category: "casa", cost: [1900, 3200] },
    { title: "Jogo de toalhas banho 4 peças", category: "casa", cost: [5900, 8900] },
    { title: "Luminária de mesa madeira", category: "casa", cost: [4900, 8500] },
  ],
  Cozinha: [
    { title: "Jogo de panelas antiaderente 5 peças", category: "cozinha", cost: [12_900, 19_900] },
    { title: "Kit potes herméticos vidro 10 peças", category: "cozinha", cost: [4500, 6900] },
    { title: "Garrafa térmica inox 1 L", category: "cozinha", cost: [3500, 5900] },
    { title: "Tábua de corte bambu", category: "cozinha", cost: [1500, 2800] },
    { title: "Faqueiro inox 24 peças", category: "cozinha", cost: [5900, 8900] },
    { title: "Escorredor de louça dobrável", category: "cozinha", cost: [2900, 4500] },
  ],
  Eletrônicos: [
    { title: "Fone bluetooth TWS com estojo", category: "eletronicos", cost: [3900, 6900] },
    { title: "Carregador turbo USB-C 20 W", category: "eletronicos", cost: [1900, 3200] },
    { title: "Cabo USB-C trançado 2 m", category: "eletronicos", cost: [800, 1500] },
    { title: "Caixa de som portátil à prova d'água", category: "eletronicos", cost: [5900, 9900] },
    { title: "Suporte de celular para carro", category: "eletronicos", cost: [1200, 2200] },
    {
      title: "Smartwatch fitness com monitor cardíaco",
      category: "eletronicos",
      cost: [8900, 14_900],
    },
    { title: "Power bank 10.000 mAh", category: "eletronicos", cost: [4500, 6900] },
  ],
  Pet: [
    { title: "Cama pet redonda pelúcia M", category: "pet", cost: [3900, 6500] },
    { title: "Arranhador para gatos 3 andares", category: "pet", cost: [7900, 12_900] },
    { title: "Coleira peitoral ajustável", category: "pet", cost: [1500, 2900] },
    { title: "Comedouro duplo inox", category: "pet", cost: [1900, 3200] },
    { title: "Brinquedo mordedor resistente", category: "pet", cost: [900, 1800] },
    { title: "Tapete higiênico lavável", category: "pet", cost: [2500, 3900] },
  ],
  Fitness: [
    { title: "Kit elásticos de resistência 5 níveis", category: "fitness", cost: [2500, 3900] },
    { title: "Tapete de yoga TPE 6 mm", category: "fitness", cost: [4500, 6900] },
    { title: "Garrafa squeeze 1 L com marcador", category: "fitness", cost: [1200, 2200] },
    { title: "Legging cintura alta compressão", category: "fitness", cost: [3500, 5500] },
    { title: "Top esportivo alta sustentação", category: "fitness", cost: [2900, 4500] },
    { title: "Corda de pular com rolamento", category: "fitness", cost: [1500, 2500] },
  ],
  Papelaria: [
    { title: "Planner anual capa dura", category: "papelaria", cost: [2500, 4200] },
    { title: "Kit canetas brush 24 cores", category: "papelaria", cost: [2900, 4500] },
    { title: "Caderno inteligente A5", category: "papelaria", cost: [4500, 6900] },
    { title: "Estojo organizador 100 divisões", category: "papelaria", cost: [1900, 3200] },
    { title: "Bloco de notas adesivas pastel", category: "papelaria", cost: [600, 1200] },
  ],
  "Infantil e brinquedos": [
    { title: "Blocos de montar 500 peças", category: "infantil", cost: [4500, 7900] },
    { title: "Pelúcia urso 40 cm", category: "infantil", cost: [2500, 4500] },
    { title: "Kit massinha de modelar 12 cores", category: "infantil", cost: [1500, 2800] },
    { title: "Body bebê algodão kit 3 peças", category: "infantil", cost: [3500, 5500] },
    { title: "Quebra-cabeça 1000 peças", category: "infantil", cost: [2900, 4500] },
  ],
};

export interface SeedSupplier {
  name: string;
  niche: keyof typeof NICHE_PRODUCTS;
  description: string;
  state: string;
  city: string;
  /** States covered entirely, and specific cities covered in other states. */
  coverage: { state: string; city?: string }[];
}

export const SUPPLIERS: SeedSupplier[] = [
  {
    name: "Ateliê Divinópolis Confecções",
    niche: "Moda feminina",
    description: "Confecção própria no polo de moda de Divinópolis, com coleções a cada 45 dias.",
    state: "MG",
    city: "Divinópolis",
    coverage: [{ state: "MG" }, { state: "SP" }, { state: "RJ" }, { state: "ES" }],
  },
  {
    name: "Brás Atacado Masculino",
    niche: "Moda masculina",
    description: "Atacadista do Brás com básicos masculinos e reposição semanal.",
    state: "SP",
    city: "São Paulo",
    coverage: [{ state: "SP" }, { state: "MG" }, { state: "PR" }],
  },
  {
    name: "Franca Calçados Direto da Fábrica",
    niche: "Calçados",
    description: "Fábrica de calçados de couro em Franca com envio em 24 horas.",
    state: "SP",
    city: "Franca",
    coverage: [{ state: "SP" }, { state: "MG" }, { state: "GO" }, { state: "RJ" }],
  },
  {
    name: "BH Beauty Distribuidora",
    niche: "Cosméticos",
    description: "Distribuidora de cosméticos nacionais com produtos registrados na Anvisa.",
    state: "MG",
    city: "Belo Horizonte",
    coverage: [{ state: "MG" }],
  },
  {
    name: "Blumenau Têxtil Casa",
    niche: "Casa e decoração",
    description: "Cama, mesa e banho do polo têxtil do Vale do Itajaí.",
    state: "SC",
    city: "Blumenau",
    coverage: [{ state: "SC" }, { state: "PR" }, { state: "RS" }, { state: "SP" }],
  },
  {
    name: "Cozinha Gaúcha Utilidades",
    niche: "Cozinha",
    description: "Utilidades domésticas com estoque próprio em Porto Alegre.",
    state: "RS",
    city: "Porto Alegre",
    coverage: [{ state: "RS" }, { state: "SC" }],
  },
  {
    name: "Curitiba Tech Acessórios",
    niche: "Eletrônicos",
    description: "Acessórios para celular e eletrônicos com garantia de 90 dias.",
    state: "PR",
    city: "Curitiba",
    coverage: [
      { state: "PR" },
      { state: "SC" },
      { state: "SP" },
      { state: "MG", city: "Belo Horizonte" },
    ],
  },
  {
    name: "Rio Pet Atacado",
    niche: "Pet",
    description: "Produtos pet com foco em acessórios e conforto.",
    state: "RJ",
    city: "Rio de Janeiro",
    coverage: [{ state: "RJ" }, { state: "ES" }, { state: "MG", city: "Juiz de Fora" }],
  },
  {
    name: "Goiânia Fit Wear",
    niche: "Fitness",
    description: "Moda fitness e acessórios para treino, produção própria em Goiânia.",
    state: "GO",
    city: "Goiânia",
    coverage: [{ state: "GO" }, { state: "DF" }, { state: "MG" }, { state: "TO" }],
  },
  {
    name: "Papelaria Recife Criativa",
    niche: "Papelaria",
    description: "Papelaria criativa e organização com envio para todo o Nordeste.",
    state: "PE",
    city: "Recife",
    coverage: [{ state: "PE" }, { state: "PB" }, { state: "AL" }, { state: "RN" }, { state: "CE" }],
  },
  {
    name: "Salvador Kids Distribuidora",
    niche: "Infantil e brinquedos",
    description: "Brinquedos certificados pelo Inmetro e moda bebê.",
    state: "BA",
    city: "Salvador",
    coverage: [{ state: "BA" }, { state: "SE" }, { state: "PE" }],
  },
  {
    name: "Fortaleza Moda Praia",
    niche: "Moda feminina",
    description: "Moda praia e resort com tecidos de proteção UV.",
    state: "CE",
    city: "Fortaleza",
    coverage: [{ state: "CE" }, { state: "RN" }, { state: "PI" }, { state: "MA" }],
  },
];

/** CEPs pre-cached so local development and E2E tests do not depend on external APIs. */
export const CACHED_CEPS = [
  {
    cep: "30130010",
    state: "MG",
    city: "Belo Horizonte",
    neighborhood: "Centro",
    street: "Avenida Afonso Pena",
  },
  { cep: "01001000", state: "SP", city: "São Paulo", neighborhood: "Sé", street: "Praça da Sé" },
  {
    cep: "20040002",
    state: "RJ",
    city: "Rio de Janeiro",
    neighborhood: "Centro",
    street: "Rua da Assembleia",
  },
  {
    cep: "80010000",
    state: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Praça Tiradentes",
  },
  {
    cep: "69005010",
    state: "AM",
    city: "Manaus",
    neighborhood: "Centro",
    street: "Rua Marcílio Dias",
  },
] as const;

export const DEMO_ACCOUNT = {
  name: "Ana Revendedora",
  email: "demo@sellbridge.local",
  cep: "30130010",
} as const;

export const ADMIN_ACCOUNT = {
  name: "Admin SellBridge",
  email: "admin@sellbridge.local",
} as const;

export const DEMO_STORES = [
  { externalShopId: "mock-shop-ana-moda", shopName: "Ana Moda (loja simulada)" },
  { externalShopId: "mock-shop-ana-casa", shopName: "Ana Casa & Beleza (loja simulada)" },
] as const;
