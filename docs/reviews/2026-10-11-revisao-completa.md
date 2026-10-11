# Revisão completa — sanitização, async, performance e segurança

Data: 2026-10-11 · Modo: `auditoria` · Branch: `feat/region-map-onboarding` (HEAD `8acd87e` + árvore de trabalho com alterações não commitadas) · Prompt: [docs/prompts/revisao-completa.md](../prompts/revisao-completa.md) (v2) · Anterior: [2026-10-10](2026-10-10-revisao-completa.md)

## Resumo executivo

O isolamento entre tenants continua sólido em todas as superfícies, inclusive na API pública v1. A API nova está bem construída: escopo antes do trabalho, outbox transacional, claim com `SKIP LOCKED` e SSRF protegida até contra DNS rebinding. Os riscos reais estão em três lugares:

1. **Cobrança errada.** `priceForRule` publica R$ 1,00 acima da regra em 1.446 combinações (custo × margem).
2. **Publicação no worker.** O anúncio fica em `pending` para sempre se o enqueue falha, e uma reentrega ou um stall publica duas vezes no Mercado Livre.
3. **Leitura de corpo sem teto em stream.** Atinge a API v1, o webhook anônimo e os uploads.

Dos 39 achados de ontem, 5 foram corrigidos e 7 parcialmente; 27 seguem abertos, incluindo os Altos #4, #6, #7, #8 e #9.

**Placar dos achados novos** (achados reavaliados contam como novos)

| Eixo        | Crítica | Alta | Média | Baixa |
| ----------- | ------- | ---- | ----- | ----- |
| Segurança   | 0       | 0    | 5     | 4     |
| Async       | 0       | 2    | 5     | 3     |
| Performance | 0       | 0    | 2     | 6     |
| Sanitização | 0       | 1    | 1     | 2     |

## Checagens

| Comando                               | Resultado                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                      | ✅                                                                                                                                                           |
| `pnpm lint`                           | ✅                                                                                                                                                           |
| `pnpm check:no-else`                  | ✅ (544 arquivos)                                                                                                                                            |
| `pnpm format:check`                   | ✅                                                                                                                                                           |
| `pnpm test`                           | ✅ 562 testes (raiz 7, shared 160, marketplaces 51, database 90, worker 30, web 224), com Postgres e Redis no ar                                             |
| `pnpm --filter @sellbridge/web build` | ✅ Nenhum código de servidor no bundle do cliente                                                                                                            |
| `pnpm test:e2e`                       | ⏭️ não rodado nesta auditoria                                                                                                                                |
| `pnpm audit --prod`                   | ⚠️ As mesmas 2 de ontem, ambas em ferramentas: `braces` (alta, via `shadcn`, sem versão corrigida) e `esbuild` (moderada, via `better-auth` → `drizzle-kit`) |

**Bundle:** 2,08 MB de JS bruto em 178 assets. Maiores chunks:

- `period-filters` (Recharts, lazy): 448 KB, 126 KB gzip
- entrada: 341 KB, 107 KB gzip
- `schemas` (Zod): 92 KB, 25 KB gzip

Phosphor tem tree-shaking por ícone; `radix-ui` não é importado inteiro.

**Banco medido:** Postgres 18.6, seed com 1.625 pedidos. Não há `pg_trgm`. As migrations 0000–0011 batem com o banco.

## Regressão dos 39 achados anteriores

Situação final: 5 corrigidos, 7 parciais, 27 abertos (dois deles reclassificados para cima, ver N1 e N11). Observação: as correções de #1, #2, #3, #5 (HTTP) e #17 já estavam em commits anteriores ao documento de ontem (`d3af694`, `6aad1fc` e `f07c4c5`). A revisão anterior estava parcialmente defasada.

| #   | Status                                  | Evidência atual                                                                                                                                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Corrigido                               | `routes/oauth/mock/autorizar.tsx:33,38-47,100-105` (`d3af694`); sem e2e                                                                                                                                                              |
| 2   | Corrigido                               | `lib/server/auth.ts:164-229,250-254` (`6aad1fc`, `93453e5`, migração 0007). Desenho diferente do sugerido (promoção só com e-mail verificado), mas fecha o risco                                                                     |
| 3   | Corrigido                               | `marketplaces/src/http.ts:19-24,82-106`, `mailer.ts:7,41`, `mock-sale.server.ts:74`. Testado em `http.test.ts`; o mailer não tem teste                                                                                               |
| 4   | **Aberto (Alta)**                       | `webhooks.server.ts:61-64`: evento duplicado responde 200 sem reenfileirar. Agravante: `enqueueWebhookEvent` sem prazo segura a resposta enquanto o ioredis repete (ver N16)                                                         |
| 5   | Parcial                                 | HTTP corrigido (POST só repete em 429). A persistência depois do POST continua retentável: ver N3                                                                                                                                    |
| 6   | **Aberto (Alta)**                       | `repositories/stores.ts:115-136`: sem compare-and-swap. Agravante: o job scheduler cria a próxima execução na ativação, então rodadas de `token-refresh` com mais de 10 min se sobrepõem entre instâncias                            |
| 7   | **Aberto (Alta)**                       | `schema/orders.ts:54`. Medido: "mais vendidos" faz Seq Scan de `order_items` da plataforma **por anúncio** (`loops=22`, 35.750 linhas para 22 anúncios). `selectDailySales` (`listing-overview.ts:204-226`) ainda sem `oi.tenant_id` |
| 8   | **Aberto (Alta)**                       | `supplier-reviews.ts:77-90`, sem cache (`reputation.server.ts:16-22`). Seq Scan de `orders` e `order_items` de todos os tenants a cada carga                                                                                         |
| 9   | **Aberto (Alta)**                       | `repositories/listings.ts:266-293`: `limit 200` sem `ORDER BY`, e a tentativa não é registrada. 200 itens apagados no ML travam o sync de todos os tenants                                                                           |
| 10  | Aberto                                  | `support.server.ts:35,63,79`, `avatar.server.ts:46`. A rota de admin não commitada (`:79`) repete o padrão. Ver N5                                                                                                                   |
| 11  | Parcial                                 | `webhooks.server.ts:28-35` barra pelo `content-length`, mas um corpo chunked passa. Ver N5 e N8                                                                                                                                      |
| 12  | Aberto → ampliado em N13                | `lib/server/tenant-session.ts:22-26`                                                                                                                                                                                                 |
| 13  | Aberto                                  | Nenhum CSP, HSTS, `frame-ancestors` ou `Referrer-Policy`; não existe `src/start.ts` nem middleware global                                                                                                                            |
| 14  | Aberto                                  | `catalog.functions.ts:69-82`; sem `uniqueIndex` em `listings(tenant_id, supplier_product_id)`                                                                                                                                        |
| 15  | Aberto → ver N3                         | Não há varredor de `publishing`; `worker.on("failed")` só loga                                                                                                                                                                       |
| 16  | Parcial                                 | O pool é fechado (`worker/src/index.ts:149`), mas sem prazo, sem try/catch e sem `unhandledRejection`                                                                                                                                |
| 17  | Corrigido                               | `mercado-livre/oauth.ts:24-31` + `http.ts:33-40`. Sem teste específico do refresh                                                                                                                                                    |
| 18  | **Aberto → reclassificado Alta (N1)**   | `shared/schemas/catalog.ts:107-108`                                                                                                                                                                                                  |
| 19  | Aberto                                  | `shared/runtime/logger.ts:29-30`. O `userFacingErrors` não commitado passa a logar todo erro inesperado, o que aumenta a exposição                                                                                                   |
| 20  | Aberto                                  | `listings.queries.ts:11`: 2 s fixos (para quando a aba está oculta). Com N2/N3, o polling não termina                                                                                                                                |
| 21  | Aberto                                  | `auth.ts` sem `cookieCache`; `getAppSession` roda em toda navegação e preload. A cadeia com `getTenantRegion` já não existe                                                                                                          |
| 22  | Aberto                                  | `client.ts:8` (`max: 10`, não configurável); dashboard com cerca de 12 queries paralelas; `orderFinanceCte` recalculado até 7× (medido: 2.353 buffers por avaliação para 449 pedidos)                                                |
| 23  | Parcial                                 | `unaccent` alinhado (`8c52547`); sem `pg_trgm`; count e página em série (`suppliers.ts:395-424`). `unaccent()` é STABLE: o índice precisa de wrapper IMMUTABLE ou de coluna gerada                                                   |
| 24  | Aberto (Perf rebaixado a Baixa)         | Medido: Hash Anti Join, 0,65 ms. O índice único continua necessário por causa do #14                                                                                                                                                 |
| 25  | Aberto → ampliado em N24                | `auth.ts:50-55`                                                                                                                                                                                                                      |
| 26  | Parcial (não commitado)                 | `lib/server/middleware.ts` (`userFacingErrors`), `user-facing-error.ts`. Cobre só funções com middleware; ver N25                                                                                                                    |
| 27  | Parcial                                 | O mock agora devolve 404 sem segredo; o placeholder de `BETTER_AUTH_SECRET` ainda passa. Ver N12                                                                                                                                     |
| 28  | **Aberto → reclassificado Média (N11)** | `auth.ts:231-297`                                                                                                                                                                                                                    |
| 29  | Aberto                                  | `schema/stores.ts:29-33`, `repositories/webhooks.ts:71-84`                                                                                                                                                                           |
| 30  | Aberto                                  | `auth.ts:94-107`: `sendResetPasswordEmail` sem try/catch                                                                                                                                                                             |
| 31  | Aberto                                  | `routes/_app/lojas.tsx:22-23,46-50`                                                                                                                                                                                                  |
| 32  | Parcial                                 | `priceCents` com teto (`90fb1a0`); `storeConnectionIds` e `priceOverrides` ainda sem `max`                                                                                                                                           |
| 33  | Aberto                                  | `mercado-livre/schemas.ts:23,29`; o `permalink` vai direto para `href` (`listing-actions.tsx:183`)                                                                                                                                   |
| 34  | Parcial                                 | `isFinal` vai para o log, mas ainda falta `UnrecoverableError`, e um 401 não chama `expireStoreOnAuthError`                                                                                                                          |
| 35  | Parcial                                 | `use-listing-actions.ts:77-117`: sem `onSettled`, e o polling de 2 s pode desfazer o patch otimista                                                                                                                                  |
| 36  | Aberto                                  | `worker/src/index.ts:28`: 5/s fixo; o `Retry-After` não pausa o bucket                                                                                                                                                               |
| 37  | Aberto                                  | Nenhum dos índices sugeridos existe                                                                                                                                                                                                  |
| 38  | Aberto                                  | `reports.ts:482` corta em 20.000 linhas sem aviso; o CSV é montado como string inteira                                                                                                                                               |
| 39  | Aberto (impacto baixo)                  | `cash-flow-chart.tsx:1056-1075` só re-renderiza em troca de série. O catálogo ainda devolve `description` e `imageUrls` (cerca de 5,5 KB por página)                                                                                 |

**Outros pontos de ontem:**

- /pedidos agrega todo o histórico: aberto.
- `orders.ts` com `findFirst` + insert: aberto, mas mitigado pelo índice único.
- `disconnectStore` não revoga o token: aberto.
- Dobra de acentos: corrigida (`8c52547`).
- Chunk do Recharts com 448 KB: aberto.

## Mapa de bordas (resumo)

- **API v1** (`routes/api/v1/**`): `authenticate` (Bearer `sb_live_`, hash SHA-256 com índice único) → `requireScope` → `enforceRateLimit` (upsert atômico) → `readBody` (64 KB, só pelo `content-length`) → Zod → claim de idempotência (POST) → handler → presenter campo a campo → `problem+json`.
- **Rotas cruas com cookie:**
  - `api/perfil/foto` → `avatar.server.ts`
  - `api/suporte/**` → `support.server.ts`
  - `api/financeiro/exportar` → `report-scope.server.ts` + `csv.ts`
  - `api/admin/**`
  - `api/oauth/**` → `oauth.server.ts`

  Todas validam sessão e tenant pelo servidor.

- **Rota anônima:** `api/webhooks/$marketplace` → `webhooks.server.ts`. HMAC no mock; `application_id` + re-busca no ML.
- **Server functions:** todas as sensíveis passam por `tenantMiddleware`/`adminMiddleware`, exceto `getAppSession` e `getSignInOptions`, que só leem a sessão.
- **Worker:** `publish-listing`, `stock-price-sync`, `token-refresh`, `webhook-event` e `webhook-delivery`.
  - Todos validam o job com Zod.
  - `attempts` e `backoff` vêm de `shared/runtime/queues.ts`.
  - Os schedulers (sync a cada 15 min, refresh a cada 10 min, entregas a cada 10 s, podas de hora em hora) são globais, não por instância.

## Achados novos

| #   | Sev.  | Eixo      | Arquivo:linha                                                                                                                                   | Problema                                                                                                                                                                                                                                               | Cenário de falha                                                                                                                                                                                                                                                         | Correção sugerida                                                                                                                                                                                                   | Teste que pegaria                                                                                                   |
| --- | ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| N1  | Alta  | San       | `packages/shared/src/schemas/catalog.ts:107-108` (#18)                                                                                          | `priceForRule` calcula em float; `raw` sai como 490,00000000000006 e o `ceil` sobe uma centena                                                                                                                                                         | Custo R$ 2,00 + 145% → publica **R$ 5,90** em vez de R$ 4,90 (conferido). Há 1.446 combinações erradas em custos de 1 a 200.000 centavos × margens de 5 a 300%. O preview (`price-receipt.tsx:79`) mostra o mesmo valor                                                  | Aritmética inteira (abaixo)                                                                                                                                                                                         | `catalog-price.test.ts` com (200, 145) → 490 e (450, 120) → 990, mais uma propriedade contra a fórmula inteira      |
| N2  | Alta  | Async     | `apps/web/src/features/listings/publish-listing.server.ts:35-36`; `lib/server/queues.ts:31-36`                                                  | `createListingWithTargets` faz commit e só depois `enqueueTargets`. Nada reenfileira um target `pending`                                                                                                                                               | O Redis reinicia → "Publicar" falha no enqueue → o target fica `pending` para sempre. `resetListingErrorsForRetry` só aceita `error`, o lote pula o produto (já "publicado") e a UI faz polling sem fim. Vale também para a API v1                                       | Relay no worker para `pending` antigos + claim atômico `pending → publishing` no processor (abaixo)                                                                                                                 | Integração: o enqueue lança erro → o relay adiciona o job; dois processors simultâneos → um único `publishProduct`  |
| N3  | Alta  | Async     | `apps/worker/src/processors/publish-listing.ts:107-136,154`; `repositories/listings.ts:174-182` (#5, #15)                                       | `markTargetPublishing` é incondicional; um erro de banco depois do POST cai em `isRetryableError` (desconhecido = retentável)                                                                                                                          | O Postgres oscila depois do `POST /items` → attempt 2 → **segundo anúncio no ML**. O worker morre no meio → stalled → roda de novo → duplicata. Dois stalls → o target fica `publishing` para sempre                                                                     | Claim de N2; target já `publishing` → `error` "confira no ML"; `UnrecoverableError` se a persistência falhar depois do POST; varredor de `publishing` com mais de 10 min                                            | Unitário: `markTargetPublished` rejeita → `UnrecoverableError` e `publishProduct` chamado uma vez em duas execuções |
| N4  | Média | Async/Seg | `apps/worker/src/lib/webhook-http.ts:77-81`                                                                                                     | Ao receber os headers, o deadline é limpo e `response.resume()` lê o corpo sem prazo nem limite (`agent: false`)                                                                                                                                       | Receptor responde 200 e manda 1 byte/s: cada execução deixa até 25 sockets abertos, cerca de 9.000/h → EMFILE → o worker perde Postgres e Redis para todos os tenants. **Reproduzido** num script fora do repositório                                                    | `response.destroy()` logo depois de ler o status                                                                                                                                                                    | Servidor que escreve a cada 100 ms; `getConnections()` chega a 0 em menos de 500 ms                                 |
| N5  | Média | San/Seg   | `features/public-api/request-steps.server.ts:51-60`; `webhooks.server.ts:28-35`; `support.server.ts:35,63,79`; `avatar.server.ts:46` (#10, #11) | O limite de corpo só olha o `content-length`; `request.text()`/`formData()` bufferiza o corpo chunked inteiro                                                                                                                                          | Uma requisição chunked de 2 GB (chave com `listings:write`, sessão comum ou anônima no webhook) estoura a memória da instância web                                                                                                                                       | Leitor em stream com corte em `shared/runtime/http-body.ts`, reusado nas quatro bordas (abaixo)                                                                                                                     | `Request` com `ReadableStream` de 65 KB sem `content-length` → 413 sem ler até o fim                                |
| N6  | Média | Seg       | `features/public-api/endpoints/webhooks.server.ts:260-287`; `shared/public-api/scopes.ts`                                                       | Uma chave só com `webhooks:manage` cria um endpoint com `eventTypes: []` e recebe todos os eventos                                                                                                                                                     | Uma chave "só para configurar webhooks" dada a um parceiro passa a receber pedidos (`totalCents`, `externalOrderId`) sem `orders:read`                                                                                                                                   | Exigir o escopo de leitura de cada tipo assinado (lista vazia exige todos) e documentar em `api.md`                                                                                                                 | Chave só com `webhooks:manage` + `eventTypes: []` → 403                                                             |
| N7  | Média | Perf      | `apps/worker/src/index.ts:100-106`; `processors/webhook-delivery.ts:40,170-178`                                                                 | Scheduler global de 10 s com lotes de 25: teto de 150 entregas/min para a plataforma inteira, sem justiça entre tenants                                                                                                                                | Um tenant gera 20.000 entregas (publicação em massa) → cerca de 133 min de fila; o `order.created` dos outros tenants espera atrás                                                                                                                                       | Repetir o claim enquanto o lote vier cheio (orçamento de cerca de 8 s); `row_number() over (partition by tenant_id)` antes do `limit`                                                                               | Integração: A com 100 entregas e B com 1 → a de B sai na primeira execução                                          |
| N8  | Média | Perf      | `schema/webhooks.ts:4-20`; `repositories/api-events.ts:79-85`; migração `0008_public_api.sql`                                                   | `webhook_events` (com `raw_payload`) não tem retenção nem índice em `received_at`. A poda de `api_events` faz seq scan (sem índice em `created_at`), `DELETE … RETURNING` sem lote, e o cascade para `webhook_deliveries` não tem índice em `event_id` | O webhook anônimo e os eventos normais acumulam para sempre. A poda horária vira um DELETE longo, com locks e todos os ids em memória                                                                                                                                    | Índices `webhook_events(received_at)`, `api_events(created_at)` e `webhook_deliveries(event_id)` com `CONCURRENTLY`; poda em lotes de 5.000 com `count`; retenção de 30 dias para processados                       | Integração da poda com N maior que o lote; `EXPLAIN` do DELETE                                                      |
| N9  | Média | Seg       | `features/public-api/docs.server.ts:6,53-54`                                                                                                    | O Scalar vem do jsDelivr sem `integrity`/`crossorigin` e sem CSP, na mesma origem do cookie de sessão                                                                                                                                                  | Se a CDN ou o pacote forem comprometidos, o script, rodando para um usuário logado, chama `createApiKeyFn` com todos os escopos e exfiltra a chave                                                                                                                       | SRI + `crossorigin` ou servir o bundle pelo app; CSP própria nessa resposta; idealmente um subdomínio sem cookie                                                                                                    | Unitário de `docsPageResponse()`: tem `integrity=` e o header CSP                                                   |
| N10 | Média | Async     | `apps/worker/src/lib/webhook-url-guard.ts:190-193`; `webhook-http.ts:27`                                                                        | `dns.lookup` sem timeout e fora do deadline; ocupa o threadpool do libuv (4 threads)                                                                                                                                                                   | Um domínio com NS mudo segura as 4 threads por 10–20 s → atrasa fs, crypto e DNS do Postgres e do Redis; lookups lentos estouram o lease de 2 min → envio em dobro                                                                                                       | `dns.promises.Resolver` com `timeout`/`tries`, dentro do deadline de 10 s                                                                                                                                           | `resolveHost` que nunca resolve → a tentativa falha em até 10 s                                                     |
| N11 | Média | Seg       | `apps/web/src/lib/server/auth.ts:231-297` (#28)                                                                                                 | Sem `rateLimit` explícito e sem `trustedProxies`. O Better Auth 1.7.7 só confia em `x-forwarded-for` com um único IP; senão o IP vira `null` e todos caem num balde só. O rate limit só liga com `NODE_ENV=production`                                 | (a) Sem proxy: um XFF aleatório por tentativa permite força bruta ilimitada. (b) Atrás de proxy (XFF com 2 IPs): todos dividem 3 tentativas a cada 10 s e o login de todos cai. (c) Reset a 100/10 s bombardeia uma vítima                                               | `rateLimit: { enabled: true, storage: "database", customRules: { "/request-password-reset": { window: 60, max: 3 } } }`, mais `advanced.ipAddress.trustedProxies` vindo de `TRUSTED_PROXIES` validado               | Integração com `auth.handler`: 4 sign-ins com XFF diferentes → 429                                                  |
| N12 | Média | Seg       | `apps/web/package.json:9`; `lib/server/environment.ts:16,21`; `mailer.ts:68-71`                                                                 | O `start` aponta para `.output/server/index.mjs`, que o build atual não gera (ele gera `dist/`). `NODE_ENV` tem padrão `development`. O placeholder de `BETTER_AUTH_SECRET` passa no `min(32)`                                                         | Um deploy sem `NODE_ENV` desliga o rate limit (N11), **loga links de reset de senha** quando falta `RESEND_API_KEY` e aceita o segredo do `.env.example`. Com o segredo público, o atacante forja a verificação de e-mail e assume contas via o link implícito do Google | Definir o runtime de produção (preset Nitro ou servidor Node) com `NODE_ENV=production`; `superRefine` que falha com `APP_URL` https + `NODE_ENV≠production` e com o placeholder; preview de e-mail só em localhost | `parseEnvironment` rejeita o placeholder e o par https/development                                                  |
| N13 | Média | Seg       | `auth.ts:296` (`organization()` com padrões); `tenant-session.ts:23-26` (#12)                                                                   | Todo `/api/auth/organization/*` está exposto sem tela (create, invite, remove-member, delete). `activeOrganizationId` não é revalidado e o `role` é o papel global                                                                                     | O membro removido mantém acesso total, inclusive para criar chaves `sb_live_`. Um admin impersonando chama `organization/delete` e apaga lojas, pedidos e chaves. A criação de organizações é ilimitada (cada uma com 20 chaves)                                         | `allowUserToCreateOrganization: false`, `organizationLimit: 1`; hook `before` bloqueando `/organization/*` exceto leitura e `set-active`; revalidar a membership em `requireTenantSession`                          | Playwright: remover o membro → sessão antiga recebe 403; `POST /organization/create` → 403                          |
| N14 | Média | Async     | `apps/worker/src/processors/token-refresh.ts:52-57`                                                                                             | `alreadyExpired` expira a loja diante de qualquer erro, inclusive timeout ou 5xx (o POST não tem retry)                                                                                                                                                | 30 min de instabilidade no ML → todas as lojas viram `expired` e todos os sellers precisam reconectar, com o refresh token ainda válido                                                                                                                                  | Expirar só em `isMarketplaceAuthError`; em erro transitório, manter `connected` com `lastError`                                                                                                                     | Erro 503 com `expiresAt` no passado → `markStoreStatus` não é chamado                                               |
| N15 | Média | Async     | `processors/webhook-event.ts:129-139`; `repositories/orders.ts:185-201`                                                                         | O `fetchOrder` acontece fora do lock e não há comparação de versão; com `WORKER_CONCURRENCY` acima de 1, duas notificações do mesmo pedido correm em paralelo                                                                                          | A busca `paid` → o pedido é cancelado → B grava `cancelled` → A grava `paid` por último. A receita conta uma venda cancelada e os integradores recebem `cancelled → paid`                                                                                                | Guardar `external_updated_at` (`date_last_updated`) e fazer `UPDATE … WHERE external_updated_at < $novo`                                                                                                            | Upsert `cancelled` (mais novo) e depois `paid` (mais antigo) → final `cancelled` e um só evento                     |
| N16 | Média | Async     | `processors/webhook-event.ts:149-159`; `shared/runtime/queues.ts:28-29` (#4)                                                                    | Com 5 tentativas e backoff de 3 s (cerca de 45 s no total), o evento fica com `processedAt` nulo para sempre. O ML não reenvia, porque recebeu 200. O enqueue na rota não tem prazo                                                                    | 1 min de indisponibilidade na API de orders do ML → as vendas dessa janela somem do financeiro                                                                                                                                                                           | Varredor de `webhook_events` com assinatura válida e não processados há mais de N min; backoff maior (30 s × 8); prazo no enqueue da rota                                                                           | `fetchOrder` falha 5× e depois funciona → o varredor cria o pedido                                                  |
| N17 | Baixa | Perf      | `repositories/webhook-deliveries.ts:114-150`                                                                                                    | Entregas `pending` de endpoints desativados ficam no topo do índice e são descartadas pelo join a cada 10 s                                                                                                                                            | O claim percorre lixo cada vez maior                                                                                                                                                                                                                                     | Status `paused` ao desativar o endpoint                                                                                                                                                                             | —                                                                                                                   |
| N18 | Baixa | Perf      | `authenticate.server.ts:44`; `repositories/api-keys.ts:101-132`                                                                                 | Um GET simples faz 5 round trips, 3 de escrita (touch, upsert e DELETE do rate limit)                                                                                                                                                                  | 120 req/min = cerca de 240 escritas/min por chave só de controle                                                                                                                                                                                                         | Podar só quando o upsert abrir uma janela nova (`xmax = 0`) ou no worker                                                                                                                                            | Contador de queries por request                                                                                     |
| N19 | Baixa | Perf      | `features/public-api/webhooks.server.ts:78-91`; `endpoints/webhooks.server.ts:254-256`                                                          | `GET /webhook-endpoints` faz 1 + N queries em `Promise.all` e o presenter descarta o resultado                                                                                                                                                         | Até 10 conexões do pool de 10 numa chamada                                                                                                                                                                                                                               | A API usa `listWebhookEndpoints`; a tela usa `row_number()`                                                                                                                                                         | —                                                                                                                   |
| N20 | Baixa | Perf      | `endpoints/events.server.ts:68-71`                                                                                                              | Com `types` e nenhum evento casando, `nextAfter` repete o `after` recebido                                                                                                                                                                             | Cada sondagem varre de novo até 30 dias de eventos                                                                                                                                                                                                                       | Devolver o maior `sequence` examinado                                                                                                                                                                               | —                                                                                                                   |
| N21 | Baixa | Async     | `schema/public-api.ts:92`; `repositories/api-events.ts:59`                                                                                      | O atraso de 5 s usa `created_at = now()` (início da transação)                                                                                                                                                                                         | Uma transação longa publica um evento "maduro" e o cursor pode pular um `sequence` menor ainda sem commit                                                                                                                                                                | `default clock_timestamp()` ou filtro por `pg_snapshot_xmin`                                                                                                                                                        | —                                                                                                                   |
| N22 | Baixa | Async     | `repositories/api-idempotency.ts:197-247`; `run-endpoint.server.ts:192-209`                                                                     | `complete` não confere o dono do claim; erro fora de `execute` escapa do problem+json; `existing` que some vira 422 por engano                                                                                                                         | Uma requisição com mais de 5 min é reexecutada por outra com a mesma chave; banco fora → resposta sem `requestId`                                                                                                                                                        | `claimToken` no WHERE; try/catch em `runEndpoint`; nova tentativa quando `!existing`                                                                                                                                | —                                                                                                                   |
| N23 | Baixa | Seg       | `api-keys.functions.ts:13-18,270-287`; `webhooks.functions.ts:18`                                                                               | Criar ou revogar chave e criar webhook não conferem o papel na organização nem a impersonação                                                                                                                                                          | Um member (via `invite-member`, N13) emite uma chave com todos os escopos; um admin impersonando cria uma chave que sobrevive à sessão, com auditoria no nome do cliente                                                                                                 | Exigir owner/admin; recusar quando houver `impersonatedBy`                                                                                                                                                          | Playwright: impersonação + `createApiKeyFn` → 403                                                                   |
| N24 | Baixa | San       | `auth.ts:39-75` (#25)                                                                                                                           | `/sign-up/email` aceita `name` sem limite e `image` arbitrária                                                                                                                                                                                         | A `image` externa carrega no navegador do admin que impersona (pixel de rastreio)                                                                                                                                                                                        | Estender `guardAccountRoutes` ao sign-up                                                                                                                                                                            | `signUpEmail` com nome de 10 mil caracteres ou com `image` → 400                                                    |
| N25 | Baixa | Seg       | `features/auth/session.functions.ts:34,62` (#26)                                                                                                | `getAppSession`/`getSignInOptions` não passam pelo `userFacingErrors`                                                                                                                                                                                  | Banco fora → erro cru do driver em todo `beforeLoad`                                                                                                                                                                                                                     | Registrar o middleware como global de função                                                                                                                                                                        | —                                                                                                                   |
| N26 | Baixa | San       | `routes/api/financeiro/exportar.ts:28`                                                                                                          | `parse` fora de `handleApi`                                                                                                                                                                                                                            | Query inválida → 500 em vez de 400; exportação pesada sem rate limit                                                                                                                                                                                                     | `safeParse` → 400                                                                                                                                                                                                   | —                                                                                                                   |
| N27 | Baixa | San       | `shared/schemas/catalog.ts:28-29`                                                                                                               | `minCost`/`maxCost` sem `max`                                                                                                                                                                                                                          | `?minCost=99999999999` estoura `int4` → 500                                                                                                                                                                                                                              | `.max(LISTING_MAX_PRICE_CENTS)`                                                                                                                                                                                     | —                                                                                                                   |
| N28 | Baixa | Async     | `support.server.ts:43-45,97-98`                                                                                                                 | Anexos gravados no disco antes de conferir o chamado e antes da transação                                                                                                                                                                              | Resposta em chamado de outro tenant ou fechado → 404, mas os arquivos ficam órfãos e enchem o disco                                                                                                                                                                      | Conferir o chamado antes de gravar, ou apagar os arquivos no `catch`                                                                                                                                                | `fileStorage.put` não é chamado com `ticketId` alheio                                                               |
| N29 | Baixa | Perf      | `repositories/listings.ts:266-293`                                                                                                              | Cada rodada de sync faz join de todos os targets publicados da plataforma                                                                                                                                                                              | O custo cresce linearmente com os anúncios vivos, a cada 15 min                                                                                                                                                                                                          | Marca `needs_sync` com índice parcial                                                                                                                                                                               | Benchmark com 100 mil targets                                                                                       |
| N30 | Baixa | Perf      | `lib/field-motion.ts:39-44`                                                                                                                     | A animação do CEP anima `paddingTop`, uma propriedade de layout                                                                                                                                                                                        | Reflow por frame durante 320 ms                                                                                                                                                                                                                                          | `transform: translateY`                                                                                                                                                                                             | —                                                                                                                   |
| N31 | Baixa | Seg       | `worker/src/environment.ts:32`; `web/lib/server/environment.ts:49`; `docs/decisions.md`                                                         | `WEBHOOK_ALLOW_PRIVATE_URLS` com `NODE_ENV=production` não falha no boot; o decisions.md diz que "5xx libera a chave", mas o código guarda; sem rotação de `whsec_`; sem rate limit por IP para chaves inválidas                                       | Configuração errada libera SSRF; integradores leem uma documentação incorreta                                                                                                                                                                                            | `superRefine` no ambiente; corrigir a decisão                                                                                                                                                                       | —                                                                                                                   |

### Correções para os achados Altos

**N1, preço em inteiros**

```ts
export function priceForRule(
  product: { costCents: number; suggestedPriceCents: number },
  rule: PriceRule,
): number {
  if (rule.kind === "suggested") {
    return Math.max(product.suggestedPriceCents, product.costCents + 100);
  }
  const scaled = product.costCents * (100 + rule.percent) + 1_000;
  const endingInNinety = Math.ceil(scaled / 10_000) * 100 - 10;
  return Math.max(endingInNinety, product.costCents + 100);
}
```

**N2 e N3, publicação sem perda e sem duplicata**

```ts
// packages/database/src/repositories/listings.ts
export async function claimTargetForPublishing(
  database: Database,
  listingTargetId: string,
): Promise<boolean> {
  const claimed = await database
    .update(listingTargets)
    .set({ status: "publishing", attempts: sql`${listingTargets.attempts} + 1` })
    .where(and(eq(listingTargets.id, listingTargetId), eq(listingTargets.status, "pending")))
    .returning({ id: listingTargets.id });
  return claimed.length > 0;
}

// apps/worker/src/processors/requeue-pending-targets.ts (scheduler a cada 5 min)
export function createRequeuePendingProcessor(dependencies: RequeueDependencies) {
  return async function requeuePendingTargets(): Promise<number> {
    const olderThan = new Date(Date.now() - STALE_PENDING_MILLISECONDS);
    const targets = await findStalePendingTargets(dependencies.database, olderThan);
    if (targets.length === 0) {
      return 0;
    }
    await dependencies.publishQueue.addBulk(targets.map((data) => ({ name: "publish", data })));
    return targets.length;
  };
}

// apps/worker/src/processors/publish-listing.ts
async function persistPublished(attempt: PublishAttempt, result: PublishedListing): Promise<void> {
  try {
    await markTargetPublished(attempt.dependencies.database, attempt.listingTargetId, result);
  } catch (error) {
    logger.error("listing.persist_after_publish_failed", {
      listingTargetId: attempt.listingTargetId,
      externalId: result.externalId,
      error,
    });
    throw new UnrecoverableError(`Anúncio ${result.externalId} criado, mas não foi salvo`);
  }
}
```

No processor: se o claim falhar e o target já estiver `publishing`, a tentativa anterior morreu no meio. Nesse caso, marcar `error` com o texto "Confira no Mercado Livre antes de reprocessar" em vez de publicar de novo. `handlePublishFailure` relança `UnrecoverableError` sem `markTargetFailed`.

**N5, corpo com teto em stream** (vale para Média, mas fecha #10, #11 e a API v1 de uma vez)

```ts
// packages/shared/src/runtime/http-body.ts
export async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return null;
  }
  if (request.body === null) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of request.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await request.body.cancel();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
```

Para os uploads multipart: `readLimitedBody` seguido de `new Response(bytes, { headers: request.headers }).formData()`.

## O que está bem feito

- **Isolamento de tenant:** todo repositório filtra por `tenantId` do contexto ou da chave, repetido nos joins. `getAttachment` esconde notas internas. A API v1 devolve 404 para um recurso de outro tenant.
- **API v1** (`request-steps.server.ts`, `problem.ts`, `endpoints/*.presenter.ts`):
  - auth com regex estrita e o mesmo 401 para chave inexistente, revogada ou expirada;
  - escopo antes de qualquer trabalho;
  - rate limit por upsert atômico;
  - idempotência com hash de método + caminho + corpo, 409 em andamento, 422 em reuso e resposta cifrada;
  - presenters explícitos campo a campo;
  - sem CORS, ignorando o cookie de sessão.
- **Outbox:** `recordApiEvent` sempre dentro da transação da mudança (`orders.ts`, `listings.ts:209-247`). Entregas com `FOR UPDATE SKIP LOCKED`, lease, 8 tentativas e `stillPending` contra dupla contagem.
- **SSRF:** endereços resolvidos todos públicos, nova checagem na conexão via `lookup` com `agent: false` (contra DNS rebinding), sem seguir redirects. IPv4 mapeado e formas octal e decimal confirmados em execução (`webhook-url-guard.ts`, `network-address.ts`).
- **HTTP para o marketplace** (`marketplaces/src/http.ts`, `mercado-livre/client.ts`): timeout por tentativa cobrindo o corpo, abort do chamador respeitado, backoff com full jitter, `Retry-After` com teto, POST e PATCH sem retry cego, 5xx de POST como permanente.
- **OAuth:** `state` de 24 bytes, uso único com `DELETE … RETURNING`, TTL, PKCE S256, `redirect_uri` fixo. O mock devolve 404 sem segredo.
- **Better Auth:** promoção a admin só com e-mail verificado, em transação; rotas de conta bloqueadas na impersonação; `activeOrganizationId` com `input: false`; `callbackURL` com `isSafeRelativeURL`.
- **Saída:** CSV neutralizado com BOM; os `dangerouslySetInnerHTML` só recebem constantes; e-mail só texto; erros genéricos para o cliente.
- **Criptografia:** AES-256-GCM com IV de 12 bytes e prefixo `v1`; `randomBytes` em todos os segredos; nenhum `Math.random`; nenhum segredo real no histórico.
- **Concorrência pontual:** `addTicketMessage` com `FOR UPDATE`; `setListingsPaused` e `resetListingErrorsForRetry` com UPDATE condicional; notificações com upsert atômico.
- **Performance:** count do financeiro em paralelo com a página; teto de período e de `pageSize`; busca com debounce; polling pausado quando a aba está oculta; code-splitting por rota; ícones com tree-shaking; tema sem context (`useSyncExternalStore`).

## Top 5 ações

1. **Preço em inteiros** (N1). Esforço **P**. É dinheiro do cliente; corrigir antes de qualquer outra coisa.
2. **Publicação confiável:** claim atômico, relay de `pending`, `UnrecoverableError` depois do POST e varredor de `publishing` (N2, N3, #5, #15, #20). Esforço **M**.
3. **Ingestão sem perda:** reenfileirar duplicados não processados, varredor de `webhook_events`, compare-and-swap dos tokens, expirar loja só em erro de auth, versão do pedido (#4, N16, #6, N14, N15). Esforço **M**.
4. **Bordas com teto e o worker protegido:** `readLimitedBody` em todas as bordas, `response.destroy()` e timeout de DNS no envio de webhooks (N5, #10, #11, N4, N10). Esforço **P/M**.
5. **Endurecer auth e deploy:** runtime de produção com `NODE_ENV`, ambiente que rejeita o placeholder, `rateLimit` + `trustedProxies`, travar `/organization/*` + revalidar a membership, headers de segurança e SRI no Scalar (N12, N11, N13, #13, N9, N6). Esforço **M**.

Logo em seguida vêm os índices e as podas, com esforço **M**: `order_items`, `api_events(created_at)`, `webhook_deliveries(event_id)`, `webhook_events(received_at)`, `ORDER BY` no sync, cache da reputação e `cookieCache` (#7, #8, #9, #21, N8).

## Lacunas de teste

- **vitest (shared):** `priceForRule` com (200, 145) e (450, 120), mais uma propriedade contra a fórmula inteira; `readLimitedBody` com stream acima do limite; `parseEnvironment` rejeitando o placeholder e https em development.
- **vitest (database):**
  - claim `pending → publishing` concorrente;
  - `updateStoreTokens` não sobrescreve uma loja desconectada;
  - upsert de pedido não regride de status;
  - poda em lotes;
  - claim de entregas justo entre tenants.
- **vitest (worker):**
  - falha de persistência depois do publish não republica;
  - relay de `pending`;
  - refresh com 503 não expira a loja;
  - receptor de webhook lento não deixa socket aberto;
  - DNS que não responde respeita o deadline;
  - varredor de `webhook_events`.
- **vitest (web):** `readBody` da API v1 com corpo chunked → 413; `handleTenantReply` com chamado de outro tenant não grava arquivo; chave só com `webhooks:manage` não assina eventos.
- **Playwright:**
  - membro removido perde acesso na hora;
  - `POST /api/auth/organization/create` → 403;
  - admin impersonando não cria chave;
  - headers `frame-ancestors`/CSP presentes;
  - 4 sign-ins com XFF diferentes → 429;
  - `/oauth/mock/autorizar` com `redirect_uri=javascript:` (ainda sem e2e).

## Atualizações do prompt

- Na seção "Contexto": `apps/worker/src/lib/` tem `webhook-http.ts` e `webhook-retry.ts`, já incluídos na v2. O runtime de produção do web não é `.output/` (o build gera `dist/`). Registrar quando o deploy for definido.
- Acrescentar ao checklist:
  - schedulers globais (não por instância) e a sobreposição de execuções quando uma rodada passa do intervalo;
  - endpoints do plugin `organization` expostos sem tela;
  - escopos implícitos via assinatura de webhook.

## Correções (branch `fix/review-2026-10-11`)

| Achado                                                  | Status        | Commit    | Testes                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 (#18) preço em float                                 | **Corrigido** | `0490d18` | `catalog-price.test.ts`: casos (200, 145) e (450, 120), mais comparação exaustiva (custos 1–20.000 × margens 5–300%) contra a fórmula inteira                                                                                                       |
| N2 publicação perdida no enqueue                        | **Corrigido** | `597b872` | `publish-recovery.test.ts`: `pending` antigo é reenfileirado, o recente não                                                                                                                                                                         |
| N3 (#5, #15) publicação duplicada / `publishing` eterno | **Corrigido** | `597b872` | `publish-listing.test.ts`: target já em `publishing` não chama o marketplace; falha ao salvar depois do POST → `UnrecoverableError` e um único `publishProduct`; `publish-recovery.test.ts`: `publishing` travado vira `error` com `listing.failed` |

Notas:

- Sem migration nesta branch: a `main` vai até a 0008, e as 0009–0011 estão em outra branch em andamento. Índice parcial sugerido para o varredor, quando as migrations assentarem: `listing_targets (updated_at) where status in ('pending', 'publishing')`.
- O polling de 2 s (#20) agora termina: todo target `pending` ou `publishing` sai desses estados em no máximo cerca de 15 min.
- Pendentes: os demais achados, a começar por #4, N16, #6, N14 e N15 (ingestão sem perda).
