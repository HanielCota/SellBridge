import { z } from "zod";

/**
 * Bling API v3 answers, checked against the official OpenAPI
 * (developer.bling.com.br, `ProdutosDadosBaseDTO`, `ProdutosDadosDTO`, `ProdutosResponse_POST_PUT`)
 * and the OAuth guide. Only the fields SellBridge reads are declared; the rest is dropped.
 */

export const blingTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

const blingTaxSchema = z
  .object({
    origem: z.number().int().nullish(),
    ncm: z.string().nullish(),
    cest: z.string().nullish(),
  })
  .nullish();

const blingImageSchema = z.object({ link: z.string() });

const blingMediaSchema = z
  .object({
    imagens: z
      .object({
        externas: z.array(blingImageSchema).nullish(),
      })
      .nullish(),
  })
  .nullish();

const blingStockSchema = z.object({ saldoVirtualTotal: z.number().nullish() }).nullish();

/** Fields shared by a product and each of its variations (`GET /produtos/{id}`). */
const blingProductFields = {
  id: z.number().int(),
  nome: z.string(),
  codigo: z.string().nullish(),
  preco: z.number().nullish(),
  situacao: z.enum(["A", "I"]),
  descricaoCurta: z.string().nullish(),
  unidade: z.string().nullish(),
  pesoLiquido: z.number().nullish(),
  pesoBruto: z.number().nullish(),
  gtin: z.string().nullish(),
  marca: z.string().nullish(),
  estoque: blingStockSchema,
  tributacao: blingTaxSchema,
  midia: blingMediaSchema,
};

/** A variation of a "V" product; `variacao.nome` names its options ("Cor:Preto;Tamanho:38"). */
const blingVariationSchema = z.object({
  ...blingProductFields,
  variacao: z.object({ nome: z.string() }).nullish(),
});
export type BlingVariation = z.infer<typeof blingVariationSchema>;

export const blingProductDetailSchema = z.object({
  ...blingProductFields,
  formato: z.enum(["S", "V", "E"]),
  variacoes: z.array(blingVariationSchema).nullish(),
});
export type BlingProductDetail = z.infer<typeof blingProductDetailSchema>;
export type BlingProductFields = z.infer<z.ZodObject<typeof blingProductFields>>;

export const blingProductDetailResponseSchema = z.object({ data: blingProductDetailSchema });

/** `GET /produtos`: the summary list; NCM, weight and images only come with the detail. */
export const blingProductSummarySchema = z.object({
  id: z.number().int(),
  idProdutoPai: z.number().int().nullish(),
  nome: z.string(),
  codigo: z.string().nullish(),
  formato: z.enum(["S", "V", "E"]),
  situacao: z.enum(["A", "I"]),
});
export type BlingProductSummary = z.infer<typeof blingProductSummarySchema>;

export const blingProductListResponseSchema = z.object({
  data: z.array(blingProductSummarySchema),
});

/** `GET /estoques/saldos` (OpenAPI `EstoquesSaldosBaseDTO`): one row per product asked. */
export const blingStockBalanceResponseSchema = z.object({
  data: z.array(
    z.object({
      produto: z.object({ id: z.number().int(), codigo: z.string().nullish() }),
      saldoFisicoTotal: z.number().nullish(),
      saldoVirtualTotal: z.number().nullish(),
    }),
  ),
});
export type BlingStockBalance = z.infer<typeof blingStockBalanceResponseSchema>["data"][number];

/** `GET /empresas/me/dados-basicos` (OpenAPI `EmpresasDadosBasicosDTO`): the company id only. */
export const blingCompanyResponseSchema = z.object({
  data: z.object({ id: z.string().trim().min(1) }),
});

export const blingCreatedProductResponseSchema = z.object({
  data: z.object({ id: z.number() }),
});

const blingFieldErrorSchema = z.object({
  msg: z.string(),
  collection: z.array(z.object({ msg: z.string() })).nullish(),
});

export const blingErrorResponseSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    description: z.string().nullish(),
    /** Each refused field, with the item lines inside `collection`. */
    fields: z.array(blingFieldErrorSchema).nullish(),
  }),
});
