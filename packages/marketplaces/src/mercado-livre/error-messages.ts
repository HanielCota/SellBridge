import { formatCents } from "@sellbridge/shared/money";
import { z } from "zod";
import { errorBodySchema } from "./schemas.ts";

/**
 * Mercado Livre's refusals in the reseller's words: what happened, then what to do. The codes
 * are the ones of the official "Validações" table (developers.mercadolivre.com.br/pt_br/validacoes,
 * read on 2026-10-15); a code it does not list keeps the marketplace's own message.
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

/** The marketplace's own words for an unknown code, cut so the listing card stays readable. */
const QUOTED_LENGTH = 300;

function quoted(words: string): string {
  const trimmed = words.replace(/\.$/, "");
  return trimmed.length <= QUOTED_LENGTH ? trimmed : `${trimmed.slice(0, QUOTED_LENGTH - 1)}…`;
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
  "item.description.type.invalid": () =>
    "A descrição tem caracteres que o Mercado Livre não aceita (emojis, HTML ou símbolos especiais). Fale com o suporte para deixar só texto simples na descrição.",
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
  const words = quoted(cause.message ?? cause.code ?? "erro sem detalhe");
  return `O Mercado Livre recusou o anúncio: ${words}. Revise o anúncio e tente de novo.`;
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
  const blocking = blockingCauses(body);
  if (blocking.length > 0) {
    return blocking.slice(0, SHOWN_ERRORS).map(explainCause).join(" ");
  }
  const parsed = errorBodySchema.safeParse(body);
  const detail = parsed.success ? (parsed.data.message ?? parsed.data.error ?? "") : "";
  return detail
    ? `Mercado Livre recusou a operação: ${detail}`
    : `Mercado Livre respondeu com erro ${status}`;
}
