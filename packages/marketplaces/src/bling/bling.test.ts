import { describe, expect, it, vi } from "vitest";
import { isMarketplaceAuthError, isMarketplaceError } from "../errors.ts";
import { createBlingClient, type BlingAccountAccess } from "./client.ts";
import { blingAuthorizationUrl, exchangeBlingCode, refreshBlingTokens } from "./oauth.ts";
import { createBlingRateLimiter } from "./rate-limit.ts";
import { readBlingCatalog } from "./catalog.ts";

const NOW = 1_800_000_000_000;
const noWait = { sleep: async () => {}, random: () => 0 };
const credentials = { clientId: "client-id", clientSecret: "client-secret" };

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function bodyText(body: RequestInit["body"]): string {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  throw new Error("unexpected request body");
}

function tokens(access: string, expiresAt = new Date(NOW + 6 * 3600_000)) {
  return { accessToken: access, refreshToken: `refresh-${access}`, expiresAt };
}

function accountAccess(initial = tokens("first")) {
  let current = initial;
  const refresh = vi.fn<() => Promise<ReturnType<typeof tokens>>>(async () => {
    current = tokens(`${current.accessToken}-renewed`);
    return current;
  });
  const access: BlingAccountAccess = {
    accountKey: "supplier-1",
    currentTokens: async () => current,
    refresh,
  };
  return { access, refresh };
}

function client(fetchImplementation: typeof fetch, access: BlingAccountAccess) {
  return createBlingClient({
    http: { fetchImplementation, retry: { ...noWait, retries: 2 } },
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    access,
    now: () => NOW,
  });
}

const simpleProduct = {
  id: 10,
  nome: "Travesseiro Eco-Pluma",
  codigo: "054-TRA-ECO-BRA",
  preco: 39.9,
  situacao: "A",
  formato: "S",
  unidade: "UN",
  pesoBruto: 0.6,
  tributacao: { origem: 0, ncm: "9404.90.00" },
  estoque: { saldoVirtualTotal: 100 },
  midia: { imagens: { externas: [{ link: "https://cdn.exemplo.com/t.jpg" }] } },
};

describe("Bling OAuth", () => {
  it("builds the consent URL with the client id and state only", () => {
    const url = new URL(blingAuthorizationUrl({ clientId: "abc", state: "xyz" }));

    expect(url.origin + url.pathname).toBe("https://www.bling.com.br/Api/v3/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "abc",
      state: "xyz",
    });
  });

  it("exchanges the code with Basic credentials in the header and asks for a JWT", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(200, { access_token: "a", refresh_token: "r", expires_in: 21600, token_type: "Bearer" }),
    );

    const result = await exchangeBlingCode(
      { fetchImplementation, credentials, now: () => NOW },
      "code-123",
    );

    const [, init] = fetchImplementation.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
    expect(headers.get("enable-jwt")).toBe("1");
    expect(bodyText(init?.body)).toBe("grant_type=authorization_code&code=code-123");
    expect(result).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: new Date(NOW + 21600 * 1000),
    });
  });

  it("asks for a new connection when Bling refuses the refresh token", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(400, { error: { type: "invalid_grant", message: "Invalid refresh token" } }),
    );

    const refreshing = refreshBlingTokens({ fetchImplementation, credentials }, "old");

    await expect(refreshing).rejects.toSatisfy(isMarketplaceAuthError);
  });
});

describe("Bling client", () => {
  it("sends the bearer token and the JWT header", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => json(200, { data: simpleProduct }));
    const { access } = accountAccess();

    await client(fetchImplementation, access).getProduct(10);

    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://api.bling.com.br/Api/v3/produtos/10");
    expect(headers.get("authorization")).toBe("Bearer first");
    expect(headers.get("enable-jwt")).toBe("1");
  });

  it("refreshes once and repeats the call after a 401", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(401, { error: { type: "UNAUTHORIZED", message: "x" } }))
      .mockResolvedValueOnce(json(200, { data: simpleProduct }));
    const { access, refresh } = accountAccess();

    const product = await client(fetchImplementation, access).getProduct(10);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(product.codigo).toBe("054-TRA-ECO-BRA");
    const [, retryInit] = fetchImplementation.mock.calls[1] ?? [];
    expect(new Headers(retryInit?.headers).get("authorization")).toBe("Bearer first-renewed");
  });

  it("refreshes before calling when the token is about to expire", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => json(200, { data: simpleProduct }));
    const { access, refresh } = accountAccess(tokens("old", new Date(NOW + 10_000)));

    await client(fetchImplementation, access).getProduct(10);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("waits for Retry-After and retries a 429", async () => {
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json(429, { error: { type: "TOO_MANY_REQUESTS", message: "x" } }, { "retry-after": "2" }),
      )
      .mockResolvedValueOnce(json(200, { data: simpleProduct }));
    const { access } = accountAccess();
    const blingClient = createBlingClient({
      http: { fetchImplementation, retry: { sleep, random: () => 0, retries: 2 } },
      limiter: createBlingRateLimiter({ sleep: async () => {} }),
      access,
      now: () => NOW,
    });

    await blingClient.getProduct(10);

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("refuses an answer that does not match the API schema", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(200, { data: { id: "not-a-number" } }),
    );
    const { access } = accountAccess();

    const reading = client(fetchImplementation, access).getProduct(10);

    await expect(reading).rejects.toSatisfy(isMarketplaceError);
  });

  it("creates a product with the SKU, price in reais and weight in kg", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => json(201, { data: { id: 99 } }));
    const { access } = accountAccess();

    const created = await client(fetchImplementation, access).createProduct({
      sku: "SB-1",
      title: "Chinelo",
      description: "",
      priceCents: 6990,
      imageUrls: ["https://cdn.exemplo.com/c.jpg"],
      gtin: null,
      brand: null,
      weightGrams: 350,
    });

    const [, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(bodyText(init?.body))).toMatchObject({
      codigo: "SB-1",
      preco: 69.9,
      pesoBruto: 0.35,
      formato: "S",
      midia: { imagens: { imagensURL: [{ link: "https://cdn.exemplo.com/c.jpg" }] } },
    });
    expect(created).toEqual({ id: 99 });
  });
});

describe("Bling rate limiter", () => {
  it("spaces one account's calls a third of a second apart", async () => {
    const clock = 0;
    const waits: number[] = [];
    const limiter = createBlingRateLimiter({
      now: () => clock,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    await limiter.acquire("a");
    await limiter.acquire("a");
    await limiter.acquire("a");
    await limiter.acquire("b");

    expect(waits.map(Math.round)).toEqual([333, 667]);
  });
});

describe("readBlingCatalog", () => {
  it("reads each top-level product's detail and skips listed variations", async () => {
    const list = [
      { id: 10, nome: "Travesseiro", codigo: "054-TRA-ECO-BRA", formato: "S", situacao: "A" },
      { id: 20, nome: "Babuche", codigo: "PAI", formato: "V", situacao: "A" },
      {
        id: 21,
        idProdutoPai: 20,
        nome: "Babuche 33/34",
        codigo: "BAB-33",
        formato: "S",
        situacao: "A",
      },
    ];
    const details: Record<string, unknown> = {
      "10": simpleProduct,
      "20": {
        ...simpleProduct,
        id: 20,
        nome: "Babuche",
        codigo: "PAI",
        formato: "V",
        variacoes: [
          { id: 21, nome: "Babuche 33/34", codigo: "BAB-33", situacao: "A", preco: 65.9 },
          { id: 22, nome: "Babuche 35/36", codigo: "BAB-35", situacao: "A", preco: 65.9 },
        ],
      },
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/produtos")) {
        return json(200, { data: list });
      }
      return json(200, { data: details[url.pathname.split("/").at(-1) ?? ""] });
    });
    const { access } = accountAccess();

    const catalog = await readBlingCatalog(client(fetchImplementation, access), {
      maxProducts: 50,
    });

    expect(catalog.items.map((item) => item.sku)).toEqual(["054-TRA-ECO-BRA", "BAB-33", "BAB-35"]);
    expect(catalog.truncated).toBe(false);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("stops at the product limit and says so", async () => {
    const list = [10, 11, 12].map((id) => ({
      id,
      nome: `P${id}`,
      codigo: `C${id}`,
      formato: "S",
      situacao: "A",
    }));
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/produtos")) {
        return json(200, { data: list });
      }
      return json(200, { data: { ...simpleProduct, codigo: url.pathname } });
    });
    const { access } = accountAccess();

    const catalog = await readBlingCatalog(client(fetchImplementation, access), { maxProducts: 2 });

    expect(catalog.items).toHaveLength(2);
    expect(catalog.truncated).toBe(true);
  });

  it("reports how many of the listed products it read", async () => {
    const list = [10, 11, 12].map((id) => ({
      id,
      nome: `P${id}`,
      codigo: `C${id}`,
      formato: "S",
      situacao: "A",
    }));
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/produtos")) {
        return json(200, { data: list });
      }
      return json(200, { data: { ...simpleProduct, codigo: url.pathname } });
    });
    const { access } = accountAccess();
    const progress: string[] = [];

    await readBlingCatalog(client(fetchImplementation, access), {
      maxProducts: 50,
      onProgress: async ({ read, total }) => {
        progress.push(`${read}/${total}`);
      },
    });

    expect(progress).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("stops before the item cap and says the catalog was cut", async () => {
    const list = [10, 11, 12].map((id) => ({
      id,
      nome: `P${id}`,
      codigo: `C${id}`,
      formato: "S",
      situacao: "A",
    }));
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(requestUrl(input));
      if (url.pathname.endsWith("/produtos")) {
        return json(200, { data: list });
      }
      return json(200, { data: { ...simpleProduct, codigo: url.pathname } });
    });
    const { access } = accountAccess();

    const catalog = await readBlingCatalog(client(fetchImplementation, access), {
      maxProducts: 50,
      maxItems: 2,
    });

    expect(catalog.items).toHaveLength(2);
    expect(catalog.truncated).toBe(true);
  });
});
