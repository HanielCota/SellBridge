import { formatCents } from "@sellbridge/shared/money";
import { z } from "zod";
import { errorBodySchema } from "./schemas.ts";

/**
 * Mercado Livre's refusals in the reseller's words: what happened, then what to do. The codes
 * are the ones of the official "Validações" table (developers.mercadolivre.com.br/pt_br/validacoes,
 * read on 2026-10-15). A code it does not list gets a Portuguese message naming the code for
 * support; the marketplace's own words only go to the log (`client.ts`), decided on 2026-10-25.
 */

const causeSchema = z.object({
  type: z.string().max(40).optional(),
  code: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
});

const causesSchema = z.array(causeSchema.passthrough()).max(100);

type MercadoLivreCause = z.infer<typeof causeSchema>;

/** How many blocking errors one message names: more would bury the first under the rest. */
const SHOWN_ERRORS = 2;

/** A marketplace code shown to the reseller: a plain identifier, never free text. */
const SUPPORT_CODE = /^[\w.-]{1,80}$/;

/** The marketplace code, when it is a plain identifier worth repeating to support; else null. */
function codeForSupport(code: string | undefined): string | null {
  if (code === undefined || !SUPPORT_CODE.test(code)) {
    return null;
  }
  return code;
}

const AGAIN = "e publique de novo.";
const ASK_SUPPORT = `Fale com o suporte para corrigir o cadastro ${AGAIN}`;

/** "[BRAND, MODEL]" in the marketplace's message, as "BRAND, MODEL". */
function bracketed(message: string | undefined): string | null {
  const match = /\[([^\]]+)\]/.exec(message ?? "");
  return match?.[1]?.trim() ?? null;
}

function missingAttributes(cause: MercadoLivreCause): string {
  const attributes = bracketed(cause.message);
  const named = attributes === null ? "" : `: ${attributes}`;
  return `Faltam atributos obrigatórios para esta categoria no Mercado Livre${named}. Preencha esses campos no cadastro do produto ${AGAIN}`;
}

function invalidPrice(cause: MercadoLivreCause): string {
  const minimum = /minimum price of ([\d.]+)/.exec(cause.message ?? "")?.[1];
  if (minimum === undefined) {
    return `O preço está fora do que o Mercado Livre aceita. Ajuste o preço ${AGAIN}`;
  }
  const minimumCents = Math.round(Number(minimum) * 100);
  return `O Mercado Livre pede preço mínimo de ${formatCents(minimumCents)} nesta categoria. Aumente o preço ${AGAIN}`;
}

const GTIN_REFUSED = `O código de barras (GTIN) do produto não foi aceito pelo Mercado Livre. ${ASK_SUPPORT}`;
const PICTURE_UNREACHABLE =
  "O Mercado Livre não conseguiu baixar uma das fotos do produto. Tente publicar de novo; se continuar, fale com o suporte.";
const LONG_ATTRIBUTE = `Um atributo do produto passou do tamanho que o Mercado Livre aceita. ${ASK_SUPPORT}`;

export const DESCRIPTION_NOT_PLAIN_TEXT =
  "A descrição tem caracteres que o Mercado Livre não aceita (emojis, HTML ou símbolos especiais). Fale com o suporte para deixar só texto simples na descrição.";

const EXPLANATIONS: Readonly<Record<string, (cause: MercadoLivreCause) => string>> = {
  "item.attributes.missing_required": missingAttributes,
  "item.attribute.missing_conditional_required": missingAttributes,
  "item.attribute.missing_catalog_required": () =>
    `Falta um atributo que o catálogo do Mercado Livre exige. ${ASK_SUPPORT}`,
  "item.price.invalid": invalidPrice,
  "item.pictures.invalid_size": () =>
    `As fotos do produto são pequenas demais para o Mercado Livre (mínimo de 500 pixels em um dos lados). Fale com o suporte para trocar as fotos ${AGAIN}`,
  "item.pictures.max": () =>
    `O produto tem mais fotos do que o Mercado Livre aceita nesta categoria. Fale com o suporte para reduzir as fotos ${AGAIN}`,
  "item.pictures.picture_not_found": () => PICTURE_UNREACHABLE,
  "item.pictures.unavailable": () => PICTURE_UNREACHABLE,
  "item.listing_type_id.requiresPictures": () =>
    `O Mercado Livre exige fotos para este anúncio. Fale com o suporte para incluir fotos no produto ${AGAIN}`,
  "item.title.minimum_length": () =>
    `O título é curto demais para o Mercado Livre. Inclua mais características do produto no título ${AGAIN}`,
  "invalid.title.gender": () =>
    `O título fala de um gênero diferente do informado na ficha do produto. Ajuste o título ${AGAIN}`,
  "item.description.type.invalid": () => DESCRIPTION_NOT_PLAIN_TEXT,
  "item.descriptions.length_exceeded": () =>
    `A descrição passou do limite de caracteres do Mercado Livre. Encurte a descrição ${AGAIN}`,
  "item.attributes.invalid_length": () => LONG_ATTRIBUTE,
  "item.attribute.values.name.invalid": () => LONG_ATTRIBUTE,
  "item.category_id.invalid": () =>
    "O Mercado Livre não aceita anúncios na categoria escolhida para este produto. Fale com o suporte para revisar a categoria.",
  "moderations.seller.not_authorized": () =>
    `Sua conta do Mercado Livre não está autorizada a vender esta marca nesta categoria. Valide a marca no Mercado Livre (Vendas > Preferências de vendas > Validações) ${AGAIN}`,
  "item.attribute.product_identifier.invalid": () => GTIN_REFUSED,
  "item.attribute.product_identifier.invalid_format": () => GTIN_REFUSED,
  "item.attribute.invalid_product_identifier": () => GTIN_REFUSED,
  "item.attribute.gtin_invalid_domain": () => GTIN_REFUSED,
  "item.attribute.gtin_invalid_brand": () => GTIN_REFUSED,
};

function explainCause(cause: MercadoLivreCause): string {
  const explain = cause.code === undefined ? undefined : EXPLANATIONS[cause.code];
  if (explain !== undefined) {
    return explain(cause);
  }
  const unexplained =
    "O Mercado Livre recusou o anúncio por um motivo que ainda não sabemos explicar.";
  const code = codeForSupport(cause.code);
  if (code === null) {
    return `${unexplained} Fale com o suporte.`;
  }
  return `${unexplained} Fale com o suporte e informe o código ${code}.`;
}

/** Shown when the item was closed or deleted on Mercado Livre: it can never sell again. */
export const LISTING_ENDED_MESSAGE =
  "Este anúncio foi encerrado ou excluído no Mercado Livre e não vende mais. Para vender de novo, clique em Reprocessar: o SellBridge cria um anúncio novo.";

const ITEM_NOT_OPEN_MESSAGE =
  "O Mercado Livre só aceita mudanças em anúncios ativos ou pausados, e este não está assim agora (pode ter sido encerrado, excluído ou estar em revisão). Confira o anúncio no Mercado Livre.";

/**
 * An update of a closed item is refused with a generic validation error whose message carries
 * the item's state, e.g. "Cannot update item MLB1 [status:closed, has_bids:false]" (seen in
 * production on 2026-11-12, with causes item.price.not_modifiable and field_not_updatable).
 */
const CLOSED_ITEM_REFUSAL = /\[status:closed\b/;

/** A refusal about the item's state rather than the data sent; null for any other refusal. */
function itemStateRefusal(body: unknown): string | null {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  if (CLOSED_ITEM_REFUSAL.test(parsed.data.message ?? "")) {
    return LISTING_ENDED_MESSAGE;
  }
  if (parsed.data.error === "item.status.invalid") {
    return ITEM_NOT_OPEN_MESSAGE;
  }
  return null;
}

/** The blocking causes of a refusal: warnings are informative and never reach the reseller. */
export function blockingCauses(body: unknown): MercadoLivreCause[] {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) {
    return [];
  }
  const causes = causesSchema.safeParse(parsed.data.cause);
  if (!causes.success) {
    return [];
  }
  return causes.data.filter((cause) => cause.type === "error");
}

/** The message a refusal reaches the reseller with (and the listing card shows). */
export function explainMercadoLivreError(body: unknown, status: number): string {
  const stateRefusal = itemStateRefusal(body);
  if (stateRefusal !== null) {
    return stateRefusal;
  }
  const blocking = blockingCauses(body);
  if (blocking.length > 0) {
    return blocking.slice(0, SHOWN_ERRORS).map(explainCause).join(" ");
  }
  const parsed = errorBodySchema.safeParse(body);
  const code = codeForSupport(parsed.success ? parsed.data.error : undefined);
  const named = code === null ? "" : ` (código ${code})`;
  return `O Mercado Livre respondeu com erro ${status}${named}. Tente de novo; se continuar, fale com o suporte.`;
}
