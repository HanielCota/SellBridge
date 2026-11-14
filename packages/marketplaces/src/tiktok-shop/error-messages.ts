/**
 * TikTok Shop refusals in the reseller's words: what happened, then what to do. The codes come
 * from the "Common errors" page and the Errorcode table of each endpoint used (read on
 * 2026-11-13). A code not listed here gets a message naming it for support; TikTok's own words
 * only go to the log (`client.ts`), as with Mercado Livre.
 */

const AGAIN = "e publique de novo.";

const PRODUCT_MESSAGES: Readonly<Record<number, string>> = {
  12019006: `O TikTok Shop recusou a descrição do produto. Revise a descrição no cadastro ${AGAIN}`,
  12052013: `A descrição passou do limite de 10.000 caracteres do TikTok Shop. Encurte a descrição ${AGAIN}`,
  12052015: `O TikTok Shop exige uma descrição. Preencha a descrição do produto ${AGAIN}`,
  12019011: `O TikTok Shop recusou o peso da embalagem. Confira o peso líquido no cadastro fiscal do produto ${AGAIN}`,
  12052006: `O TikTok Shop recusou o peso da embalagem. Confira o peso líquido no cadastro fiscal do produto ${AGAIN}`,
  12052181: `O peso da embalagem não pode ser zero no TikTok Shop. Informe o peso líquido no cadastro fiscal do produto ${AGAIN}`,
  12052028: `O TikTok Shop exige pelo menos uma foto. Adicione uma foto ao produto ${AGAIN}`,
  12052051: `O título passou do limite do TikTok Shop. Encurte o título ${AGAIN}`,
  12052931: `O TikTok Shop não aceita emojis nem símbolos especiais no título. Ajuste o título ${AGAIN}`,
  12052104: `Faltam atributos obrigatórios para esta categoria no TikTok Shop. Fale com o suporte para completar o cadastro ${AGAIN}`,
  12052105:
    "Esta categoria exige uma qualificação da loja no TikTok Shop. Envie a qualificação no Seller Center e publique de novo.",
  12019064: `O TikTok Shop não encontrou uma categoria para este título. Escreva o nome completo do produto no título ${AGAIN}`,
  12052912: `O produto não combina com a categoria principal da loja no TikTok Shop. Confira a categoria principal no Seller Center ${AGAIN}`,
  12052073: "O TikTok Shop recusou o preço. Confira o preço de venda do anúncio e tente de novo.",
  12052570:
    "O preço passou do limite do TikTok Shop. Confira o preço de venda do anúncio e tente de novo.",
  12052038:
    "O preço está travado por uma promoção ativa no TikTok Shop. Espere a promoção acabar para mudar o preço.",
  12019045:
    "O preço está travado no TikTok Shop. Espere a promoção ou a análise acabar para mudar o preço.",
  12052055: "O estoque precisa ficar entre 0 e 999.999 unidades no TikTok Shop.",
  12052115:
    "A loja não tem armazém cadastrado no TikTok Shop. Cadastre o endereço de envio no Seller Center e publique de novo.",
  12052097:
    "O armazém do anúncio não existe mais no TikTok Shop. Confira os armazéns no Seller Center e tente de novo.",
  12052093:
    "A loja atingiu o limite de anúncios do TikTok Shop. Espere o limite renovar ou encerre anúncios antigos.",
  12052032: "O anúncio não existe mais no TikTok Shop.",
  12052260: "O anúncio não existe mais no TikTok Shop.",
  12052048: "O anúncio não pertence a esta loja no TikTok Shop.",
  12052308:
    "O anúncio tem um recurso em andamento no TikTok Shop. Cancele o recurso no Seller Center para editar.",
  12038005: `Uma foto passou de 10 MB, o limite do TikTok Shop. Use fotos menores ${AGAIN}`,
  12038004: `O TikTok Shop não aceitou o formato de uma foto. Use fotos JPG, PNG ou WEBP ${AGAIN}`,
  12038014: `Uma foto está fora do tamanho aceito pelo TikTok Shop (de 300 a 4000 pixels de lado). Troque a foto ${AGAIN}`,
  12019116: `Uma foto está fora do tamanho aceito pelo TikTok Shop (de 300 a 4000 pixels de lado). Troque a foto ${AGAIN}`,
};

const ACCESS_MESSAGES: Readonly<Record<number, string>> = {
  105005:
    "O SellBridge ainda não tem permissão no TikTok Shop para esta ação. Fale com o suporte do SellBridge.",
  36009033: "O TikTok Shop bloqueou o endereço do SellBridge. Fale com o suporte do SellBridge.",
  36004004: "A autorização do TikTok Shop expirou antes de terminar. Conecte a loja de novo.",
};

const KNOWN_MESSAGES: Readonly<Record<number, string>> = {
  ...PRODUCT_MESSAGES,
  ...ACCESS_MESSAGES,
};

/** The refusal of a TikTok Shop `code` in Portuguese; unknown codes are named for support. */
export function explainTikTokShopError(code: number, httpStatus: number): string {
  const known = Object.hasOwn(KNOWN_MESSAGES, code) ? KNOWN_MESSAGES[code] : undefined;
  if (known !== undefined) {
    return known;
  }
  if (code === 0) {
    return `O TikTok Shop respondeu com um erro inesperado (HTTP ${httpStatus}). Tente de novo em alguns minutos.`;
  }
  return `O TikTok Shop recusou a operação (código ${code}). Fale com o suporte do SellBridge informando esse código.`;
}
