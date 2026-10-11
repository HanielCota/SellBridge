import { environment } from "@/lib/server/environment";
import { API_OPERATIONS } from "./endpoints/index.server";
import { buildOpenApiDocument } from "./openapi";
import { API_REQUESTS_PER_MINUTE } from "./rate-limit.server";

const SCALAR_SCRIPT = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.2";

function apiBaseUrl(): string {
  return `${environment.APP_URL.replace(/\/$/, "")}/api/v1`;
}

function description(): string {
  const base = apiBaseUrl();
  return [
    "API REST para integrar o SellBridge a ERPs, planilhas e outros sistemas.",
    "## Começando",
    "1. Em **Integrações**, crie uma chave de API com os escopos de que precisa. Ela aparece uma única vez.",
    "2. Envie a chave em todas as requisições: `Authorization: Bearer sb_live_...`.",
    `3. Teste com \`curl ${base}/me -H "Authorization: Bearer $SELLBRIDGE_API_KEY"\`.`,
    "## Convenções",
    "- JSON com nomes em camelCase; dinheiro em centavos (`priceCents`), sempre em reais; datas em ISO 8601 (UTC).",
    "- Um recurso vem em `{ data }`; listas vêm em `{ data: [...], pagination }` e aceitam `page` e `pageSize`.",
    "- Toda requisição `POST` exige o cabeçalho `Idempotency-Key`. Repetir a mesma requisição com a mesma chave devolve a primeira resposta (cabeçalho `Idempotent-Replayed: true`).",
    `- Até ${API_REQUESTS_PER_MINUTE} requisições por minuto por chave. Os cabeçalhos \`RateLimit-Limit\`, \`RateLimit-Remaining\` e \`RateLimit-Reset\` mostram quanto resta; acima do limite a resposta é 429 com \`Retry-After\`.`,
    "- Erros seguem o RFC 9457 (`application/problem+json`) com um `code` estável e o `requestId` para o suporte.",
    "- A chave é um segredo do servidor: não use a API direto do navegador.",
    "## Eventos e webhooks",
    "Pedidos e anúncios geram eventos. Leia com `GET /events` ou cadastre um webhook: cada entrega é um `POST` assinado com o cabeçalho `SellBridge-Signature: t=<timestamp>,v1=<hmac>`, onde `hmac` é o HMAC-SHA256 hexadecimal de `<timestamp>.<corpo>` com o segredo do webhook.",
  ].join("\n\n");
}

export function openApiResponse(): Response {
  const document = buildOpenApiDocument({
    operations: API_OPERATIONS,
    serverUrl: apiBaseUrl(),
    description: description(),
  });
  return new Response(JSON.stringify(document), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}

/** Interactive reference rendered by Scalar from the OpenAPI document. */
export function docsPageResponse(): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SellBridge API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script src="${SCALAR_SCRIPT}"></script>
  </body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
