import type { ProfileKind } from "./profile-kind.ts";
import type { SupportAnswer } from "./support-assistant.ts";

/**
 * A curated answer and when it applies: to the situations it was written for, and to open-ended
 * questions ("Outra coisa", "Outro problema") whose text contains one of its keywords. Keywords
 * are lowercase and without accents, matched against the customer's text normalized the same way.
 */
export interface SupportFaqEntry {
  answer: SupportAnswer;
  /** `category:situationId` pairs this answer is the reply to. */
  situations: readonly string[];
  keywords: readonly string[];
}

const PASSWORD: SupportFaqEntry = {
  answer: {
    id: "password",
    title: "Como trocar a senha",
    steps: [
      "Abra Meu perfil.",
      "Na parte Senha, digite a senha atual e a nova senha.",
      "Esqueceu a senha atual? Saia da conta e, na tela de entrada, toque em “Esqueceu a senha?” para receber um link por e-mail.",
    ],
    links: [{ label: "Abrir Meu perfil", path: "/perfil" }],
  },
  situations: [],
  keywords: ["senha"],
};

const SELLER_ENTRIES: readonly SupportFaqEntry[] = [
  {
    answer: {
      id: "seller-publish",
      title: "Como publicar um produto",
      steps: [
        "Abra o Catálogo e escolha o produto.",
        "Toque em Publicar.",
        "Escolha as lojas e confira o título e o preço. O preço precisa cobrir o custo e as taxas.",
        "Confirme. O anúncio aparece em Publicações; se der erro, a mensagem diz o que corrigir.",
      ],
      links: [
        { label: "Abrir o Catálogo", path: "/catalogo" },
        { label: "Ver Publicações", path: "/publicacoes" },
      ],
    },
    situations: ["listing:publish-error"],
    keywords: ["publicar", "publico", "anunciar", "como anuncio"],
  },
  {
    answer: {
      id: "seller-listing-paused",
      title: "Por que um anúncio fica pausado",
      steps: [
        "Abra Publicações e procure o anúncio: o motivo aparece nele.",
        "Fornecedor inativo ou produto indisponível: o anúncio volta quando o fornecedor reativar. Depois toque em Reativar.",
        "Custo acima do preço: o fornecedor subiu o custo. Aumente o preço do anúncio para voltar a vender.",
        "Se o site onde você vende barrou o anúncio, corrija o que o aviso pede e publique de novo.",
      ],
      links: [{ label: "Ver Publicações", path: "/publicacoes" }],
    },
    situations: ["listing:listing-blocked"],
    keywords: ["pausad", "parado", "recusad"],
  },
  {
    answer: {
      id: "seller-store-reconnect",
      title: "Como religar a loja",
      steps: [
        "Abra a página Lojas.",
        "Na loja que aparece como desconectada, toque em Reconectar.",
        "Entre na sua conta do site onde você vende e autorize o acesso.",
        "Pronto: pedidos e estoque voltam a atualizar sozinhos.",
      ],
      links: [{ label: "Abrir Lojas", path: "/lojas" }],
    },
    situations: ["store:store-disconnected"],
    keywords: ["desconect", "reconect"],
  },
  {
    answer: {
      id: "seller-store-connect",
      title: "Como ligar a sua loja",
      steps: [
        "Abra a página Lojas e escolha o site onde você vende.",
        "Entre com a conta da loja (a mesma que você usa para vender) e aceite todas as permissões.",
        "Se aparecer “acesso negado”, saia da conta nesse site, entre de novo e tente outra vez.",
      ],
      links: [{ label: "Abrir Lojas", path: "/lojas" }],
    },
    situations: ["store:connect-error"],
    keywords: ["conectar", "ligar a loja", "ligar minha loja"],
  },
  {
    answer: {
      id: "seller-plan",
      title: "Como mudar o plano ou o cartão",
      steps: [
        "Abra Planos e assinatura.",
        "Para mudar de plano, escolha o plano e toque em Selecionar plano.",
        "Para trocar o cartão, ver faturas ou cancelar a renovação, toque em Gerenciar assinatura e faturas.",
      ],
      links: [{ label: "Abrir Planos e assinatura", path: "/assinatura" }],
    },
    situations: ["account:plan"],
    keywords: ["plano", "cartao", "assinatura", "mensalidade"],
  },
  {
    answer: {
      id: "seller-forward-order",
      title: "Como encaminhar um pedido ao fornecedor",
      steps: [
        "Abra Pedidos e toque no pedido.",
        "Confira o endereço de entrega.",
        "Toque em Criar ordens e encaminhar aos fornecedores.",
        "Cada fornecedor recebe só os itens dele e cuida da separação e do envio.",
      ],
      links: [{ label: "Abrir Pedidos", path: "/pedidos" }],
    },
    situations: [],
    keywords: ["encaminh"],
  },
  {
    answer: {
      id: "seller-supplier-ships",
      title: "Quando o fornecedor envia o pedido",
      steps: [
        "Depois de encaminhado, o fornecedor aceita o pedido e despacha até o prazo do site onde você vendeu.",
        "A etapa e o rastreio aparecem na página do pedido.",
        "Se o prazo passar, o pedido mostra “Despacho atrasado”. Aí abra um chamado pelo próprio pedido.",
      ],
      links: [{ label: "Abrir Pedidos", path: "/pedidos" }],
    },
    situations: [],
    keywords: ["quando o fornecedor", "fornecedor envia", "prazo de envio", "despach"],
  },
  PASSWORD,
];

const SUPPLIER_ENTRIES: readonly SupportFaqEntry[] = [
  {
    answer: {
      id: "supplier-import",
      title: "Como corrigir a planilha de produtos",
      steps: [
        "Abra Importar planilha no seu painel.",
        "Toque em Baixar modelo e use as mesmas colunas, sem mudar os nomes.",
        "Envie a planilha. As linhas com erro aparecem com o motivo: corrija só elas e envie de novo.",
      ],
      links: [{ label: "Abrir Importar planilha", path: "/fornecedor/painel/importar" }],
    },
    situations: ["listing:import-error"],
    keywords: ["planilha", "importa"],
  },
  {
    answer: {
      id: "supplier-product-hidden",
      title: "Por que os revendedores não veem um produto",
      steps: [
        "Os revendedores só veem produtos aprovados.",
        "Em Produtos, veja se o produto está Em análise, Reprovado ou como Rascunho.",
        "Reprovado: o motivo aparece no produto. Corrija e envie de novo para análise.",
      ],
      links: [{ label: "Abrir Produtos", path: "/fornecedor/painel/produtos" }],
    },
    situations: ["listing:product-hidden"],
    keywords: ["sumiu", "reprovad", "recusad", "em analise"],
  },
  {
    answer: {
      id: "supplier-stock-price",
      title: "Como mudar o estoque ou o preço",
      steps: [
        "Em Produtos, abra o produto.",
        "Mude o estoque ou o preço e salve.",
        "Os anúncios dos revendedores recebem o valor novo em alguns minutos.",
      ],
      links: [{ label: "Abrir Produtos", path: "/fornecedor/painel/produtos" }],
    },
    situations: ["listing:stock-or-price"],
    keywords: ["estoque"],
  },
  {
    answer: {
      id: "supplier-brand",
      title: "Como mudar a página da marca",
      steps: [
        "Abra Marca no seu painel.",
        "Troque o logo, a descrição ou as fotos.",
        "Toque em Salvar.",
      ],
      links: [{ label: "Abrir Marca", path: "/fornecedor/painel/marca" }],
    },
    situations: ["account:brand-page"],
    keywords: ["logo", "marca"],
  },
  PASSWORD,
];

export const SUPPORT_FAQ: Readonly<Record<ProfileKind, readonly SupportFaqEntry[]>> = {
  seller: SELLER_ENTRIES,
  supplier: SUPPLIER_ENTRIES,
};
