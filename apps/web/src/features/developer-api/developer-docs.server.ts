import { DEVELOPER_SCOPE_LABELS, type DeveloperScope } from "@sellbridge/shared/developer-api";
import { buildOpenApiDocument } from "@/features/public-api/openapi";
import { environment } from "@/lib/server/environment";
import {
  DEVELOPER_REQUESTS_PER_CREATOR_PER_MINUTE,
  DEVELOPER_REQUESTS_PER_MINUTE,
} from "./developer-rate-limit.server";
import { DEVELOPER_OPERATIONS } from "./endpoints/index.server";

/** Same version as the organizations' API reference (`docs.server.ts`). */
const SCALAR_SCRIPT =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.69.2/dist/browser/standalone.js";
/** The manual runs while a developer is signed in: a changed CDN file must not run at all. */
const SCALAR_INTEGRITY = "sha384-WIChsUVC1uJ+G1lFA6lPYzOUgXAe8dVxUFIZ7lcENNtV34Esuo81NIxsj8EAQeHB";
const DOCS_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.scalar.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.scalar.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function developerApiBaseUrl(): string {
  return `${environment.APP_URL.replace(/\/$/, "")}/api/dev/v1`;
}

function description(): string {
  const base = developerApiBaseUrl();
  return [
    "API para os desenvolvedores do SellBridge usarem os dados em outros projetos. Lê os dados de **todas** as organizações e fornecedores, limitada aos tipos de informação marcados na chave. A única coisa que ela cria é o link de entrada (`POST /entry-links`), que leva uma pessoa ao SellBridge com produtos já escolhidos; ela nunca muda os dados de uma organização.",
    "## Começando",
    "1. Na tela **Chaves de desenvolvedor**, crie uma chave e marque o que ela pode ler. Ela aparece uma única vez.",
    "2. Envie a chave em todas as requisições: `Authorization: Bearer sb_dev_...`.",
    `3. Teste com \`curl ${base}/me -H "Authorization: Bearer $SELLBRIDGE_DEV_KEY"\`.`,
    "4. Liste as organizações (`GET /organizations`) e use o `id` delas nas rotas `/organizations/{organizationId}/...`.",
    "## Convenções",
    "- JSON com nomes em camelCase; dinheiro em centavos (`costCents`), sempre em reais; datas em ISO 8601 (UTC).",
    "- Um recurso vem em `{ data }`; listas vêm em `{ data: [...], pagination }` e aceitam `page` e `pageSize` (até 100).",
    `- Até ${DEVELOPER_REQUESTS_PER_MINUTE} requisições por minuto por chave e ${DEVELOPER_REQUESTS_PER_CREATOR_PER_MINUTE} somando todas as chaves de quem as criou; acima disso a resposta é 429 com \`Retry-After\`.`,
    "- Uma rota fora dos tipos marcados na chave responde 403; uma organização que não existe responde 404.",
    "- Erros seguem o RFC 9457 (`application/problem+json`) com um `code` estável e o `requestId`.",
    "- Nunca saem tokens das lojas, chaves do Asaas, senhas nem outros segredos. O endereço de entrega do comprador só vem com `buyers:personal`; o CPF do comprador não é guardado pelo SellBridge.",
    "- O endereço de entrega também pode aparecer nas mensagens dos chamados (`support:read`), quando o comprador o colou no texto.",
    "- A chave é um segredo do servidor: não use a API direto do navegador. Todo uso fica registrado: a operação, a organização, o registro lido e se saiu dado pessoal, inclusive as chamadas recusadas.",
  ].join("\n\n");
}

export function buildDeveloperOpenApiDocument() {
  return buildOpenApiDocument<DeveloperScope>({
    operations: DEVELOPER_OPERATIONS,
    serverUrl: developerApiBaseUrl(),
    description: description(),
    settings: {
      title: "SellBridge API de desenvolvedor",
      bearerFormat: "sb_dev_...",
      scopeLabel: (scope) => DEVELOPER_SCOPE_LABELS[scope],
      idempotentPosts: false,
    },
  });
}

/** `<` would let the document close the script tag it is embedded in. */
function embeddable(document: unknown): string {
  return JSON.stringify(document).replaceAll("<", "\\u003c");
}

/**
 * The interactive manual, for developers signed in to the app. The document is embedded in the
 * page because the browser has no developer key to fetch `/openapi.json` with.
 */
export function developerDocsPageResponse(): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>SellBridge API de desenvolvedor</title>
  </head>
  <body>
    <script id="api-reference" type="application/json">${embeddable(buildDeveloperOpenApiDocument())}</script>
    <script src="${SCALAR_SCRIPT}" integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"></script>
  </body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": DOCS_CONTENT_SECURITY_POLICY,
    },
  });
}
