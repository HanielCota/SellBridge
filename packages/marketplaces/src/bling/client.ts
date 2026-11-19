import { isMarketplaceAuthError } from "../errors.ts";
import {
  BLING_API_BASE_URL,
  BLING_JWT_HEADERS,
  blingRequest,
  type BlingHttpOptions,
} from "./http.ts";
import { blingInvoiceCalls, type BlingCall } from "./invoices.ts";
import type { BlingTokens } from "./oauth.ts";
import type { BlingRateLimiter } from "./rate-limit.ts";
import {
  blingCompanyResponseSchema,
  blingStockBalanceResponseSchema,
  blingCreatedProductResponseSchema,
  blingProductDetailResponseSchema,
  blingProductListResponseSchema,
  type BlingProductDetail,
  type BlingProductSummary,
  type BlingStockBalance,
} from "./schemas.ts";
import type { z } from "zod";

/** How the client gets and renews the account's tokens; storage stays with the caller. */
export interface BlingAccountAccess {
  /** One key per Bling account (the supplier id): the rate limit is per account. */
  readonly accountKey: string;
  readonly currentTokens: () => Promise<BlingTokens>;
  /** Refreshes, saves and returns the new tokens. */
  readonly refresh: () => Promise<BlingTokens>;
}

export interface BlingClientOptions {
  readonly http: BlingHttpOptions;
  readonly limiter: BlingRateLimiter;
  readonly access: BlingAccountAccess;
  readonly now?: () => number;
}

/** Tokens this close to expiry are refreshed before the call instead of failing it. */
const EXPIRY_MARGIN_IN_MS = 60_000;

/** Bling's largest page for `GET /produtos`. */
export const BLING_PAGE_LIMIT = 100;

/** Products per `GET /estoques/saldos` (the documented maximum with multi-company stock on). */
export const BLING_STOCK_BATCH_LIMIT = 100;

/** `filtroSaldoEstoque`: 0 zero, 1 positive (the default), 2 negative. */
export type BlingStockFilter = 0 | 1 | 2;

/** `criterio` of `GET /produtos`: 2 lists active products, 5 lists every status. */
const ACTIVE_PRODUCTS = 2;
const ANY_STATUS = 5;

/** Body of `POST /produtos` for a product SellBridge has and the ERP does not. */
export interface BlingNewProduct {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  readonly priceCents: number;
  readonly imageUrls: readonly string[];
  readonly gtin: string | null;
  readonly brand: string | null;
  readonly weightGrams: number | null;
}

type ApiRequest<Result> = { path: string; init?: RequestInit; schema: z.ZodType<Result> };

function newProductBody(product: BlingNewProduct) {
  const weightInKg = product.weightGrams === null ? undefined : product.weightGrams / 1000;
  return {
    nome: product.title,
    codigo: product.sku,
    preco: product.priceCents / 100,
    tipo: "P",
    situacao: "A",
    formato: "S",
    descricaoCurta: product.description,
    ...(product.gtin === null ? {} : { gtin: product.gtin }),
    ...(product.brand === null ? {} : { marca: product.brand }),
    ...(weightInKg === undefined ? {} : { pesoBruto: weightInKg, pesoLiquido: weightInKg }),
    midia: { imagens: { imagensURL: product.imageUrls.map((link) => ({ link })) } },
  };
}

/** Calls the API for one account: limit, fresh token, and a single refresh-and-retry on 401. */
function createBlingCaller(options: BlingClientOptions) {
  const now = options.now ?? Date.now;

  async function usableTokens(): Promise<BlingTokens> {
    const tokens = await options.access.currentTokens();
    if (tokens.expiresAt.getTime() - now() > EXPIRY_MARGIN_IN_MS) {
      return tokens;
    }
    return options.access.refresh();
  }

  async function send<Result>(request: ApiRequest<Result>, tokens: BlingTokens): Promise<Result> {
    await options.limiter.acquire(options.access.accountKey);
    const init = request.init ?? {};
    return blingRequest(options.http, {
      url: `${BLING_API_BASE_URL}${request.path}`,
      init: {
        ...init,
        headers: {
          ...BLING_JWT_HEADERS,
          Accept: "application/json",
          Authorization: `Bearer ${tokens.accessToken}`,
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
      },
      schema: request.schema,
    });
  }

  /** A second 401 after the refresh means the account must reconnect. */
  return async function call<Result>(request: ApiRequest<Result>): Promise<Result> {
    const tokens = await usableTokens();
    try {
      return await send(request, tokens);
    } catch (error) {
      if (!isMarketplaceAuthError(error)) {
        throw error;
      }
      return send(request, await options.access.refresh());
    }
  };
}

/** The stock sync's reads: the account's company id and product balances. */
function blingStockCalls(call: BlingCall) {
  return {
    /** The id Bling's notifications carry as `companyId` for this account. */
    async getCompanyId(): Promise<string> {
      const response = await call({
        path: "/empresas/me/dados-basicos",
        schema: blingCompanyResponseSchema,
      });
      return response.data.id;
    },

    /**
     * The stock balance of these products (at most `BLING_STOCK_BATCH_LIMIT`), among those whose
     * balance matches `filter`: Bling leaves the others out of the answer.
     */
    async readStockBalances(
      productIds: readonly number[],
      filter: BlingStockFilter,
    ): Promise<BlingStockBalance[]> {
      if (productIds.length === 0) {
        return [];
      }
      if (productIds.length > BLING_STOCK_BATCH_LIMIT) {
        throw new RangeError(
          `At most ${BLING_STOCK_BATCH_LIMIT} products per stock read, got ${productIds.length}`,
        );
      }
      const query = new URLSearchParams({ filtroSaldoEstoque: String(filter) });
      for (const id of productIds) {
        query.append("idsProdutos[]", String(id));
      }
      const response = await call({
        path: `/estoques/saldos?${query.toString()}`,
        schema: blingStockBalanceResponseSchema,
      });
      return response.data;
    },
  };
}

export function createBlingClient(options: BlingClientOptions) {
  const call = createBlingCaller(options);

  return {
    ...blingInvoiceCalls(call),
    ...blingStockCalls(call),
    /** One page of the summary list (active products by default). */
    async listProducts(input: { page: number; criterio?: 1 | 2 | 3 | 4 | 5 }) {
      const query = new URLSearchParams({
        pagina: String(input.page),
        limite: String(BLING_PAGE_LIMIT),
        criterio: String(input.criterio ?? ACTIVE_PRODUCTS),
      });
      const response = await call({
        path: `/produtos?${query.toString()}`,
        schema: blingProductListResponseSchema,
      });
      return response.data satisfies BlingProductSummary[];
    },

    /** The full product, with NCM, weight, images and variations. */
    async getProduct(id: number): Promise<BlingProductDetail> {
      const response = await call({
        path: `/produtos/${id}`,
        schema: blingProductDetailResponseSchema,
      });
      return response.data;
    },

    /** The Bling products among these SKUs (`codigos[]`), any status. */
    async findProductsByCodes(codes: readonly string[]): Promise<BlingProductSummary[]> {
      if (codes.length === 0) {
        return [];
      }
      const query = new URLSearchParams({
        criterio: String(ANY_STATUS),
        limite: String(BLING_PAGE_LIMIT),
      });
      for (const code of codes) {
        query.append("codigos[]", code);
      }
      const response = await call({
        path: `/produtos?${query.toString()}`,
        schema: blingProductListResponseSchema,
      });
      return response.data;
    },

    /** Creates one product; the caller made sure its SKU is not in Bling yet. */
    async createProduct(product: BlingNewProduct): Promise<{ id: number }> {
      const response = await call({
        path: "/produtos",
        init: { method: "POST", body: JSON.stringify(newProductBody(product)) },
        schema: blingCreatedProductResponseSchema,
      });
      return { id: response.data.id };
    },
  };
}

export type BlingClient = ReturnType<typeof createBlingClient>;
