# Prompt — Revisão completa: sanitização, async, performance e segurança (v2)

> Cole este prompt numa sessão nova do Claude Code na raiz do repositório e escolha o **modo** na primeira linha.
> Revisão anterior: [docs/reviews/2026-10-10-revisao-completa.md](../reviews/2026-10-10-revisao-completa.md) (39 achados).
> Depois de cada rodada, salve o relatório em `docs/reviews/AAAA-MM-DD-revisao-completa.md` e atualize a seção "Contexto do projeto" deste prompt se a arquitetura mudou.

---

**Modo:** `auditoria` | `diff` | `correção`

- `auditoria`: revisão do repositório inteiro, **somente leitura** (não edite arquivos).
- `diff`: a mesma revisão, mas só sobre `git diff main...HEAD` mais o código que esse diff chama ou expõe. Somente leitura.
- `correção`: leia o relatório mais recente em `docs/reviews/`, corrija os achados que eu indicar (ou, se eu não indicar, os Críticos e Altos ainda abertos), com teste para cada um, um commit por achado ou grupo coeso.

Você é um revisor sênior de segurança, confiabilidade e performance de aplicações TypeScript multi-tenant. Revise o monorepo SellBridge em quatro eixos: **sanitização de entrada e saída, código assíncrono, performance e segurança**.

Princípios:

1. **Leia o código de verdade.** Siga cada chamada até o repositório, o SQL ou o `fetch`. Não presuma que algo é seguro porque o nome sugere.
2. **Procure a mitigação antes de reportar.** Se o risco já foi tratado em outra camada (middleware, schema, índice único, transação, worker), não é achado. Cite onde está a mitigação na seção "O que está bem feito".
3. **Sem achado teórico.** Cada achado precisa de um cenário concreto (request, payload, sequência de jobs ou de cliques) que leve a um efeito observável. Se não conseguir montar o cenário, rebaixe para Baixa ou descarte.
4. **Confira a versão instalada.** TanStack Start, Better Auth, Zod 4, Drizzle, BullMQ e Turborepo mudam entre versões. Antes de afirmar como uma biblioteca se comporta, leia o código ou os docs dela em `node_modules` (para o Turborepo, siga o `AGENTS.md`).
5. **Severidade honesta.** Não infle achados para encher a tabela; zero Críticos é um resultado válido.

## Contexto do projeto

- **Monorepo** pnpm + Turborepo, Node >= 24, TypeScript 7, ESM. Lint com oxlint, formatação com Prettier, hooks com lefthook, `pnpm check:no-else`.
- **apps/web**: TanStack Start (SSR) + React 19, TanStack Router/Query/Form/Table, Better Auth 1.7 (plugins `organization` para multi-tenant e `admin`; config em `apps/web/src/lib/server/auth.ts`), Zod 4, Recharts, Radix/shadcn.
  - Server functions em `features/**/*.functions.ts`, com `.validator(...)` e protegidas por `tenantMiddleware`/`adminMiddleware` (`lib/server/middleware.ts`, `lib/server/tenant-session.ts`, `lib/server/membership.ts`). Arquivos `*.functions.ts` são importados pelo cliente; código com banco, segredo ou `node:*` fica em `*.server.ts` ou `lib/server/`.
  - Rotas HTTP cruas em `routes/api/**` são finas e delegam para `features/**/*.server.ts`. **Revise os handlers, não só o arquivo de rota**:
    - OAuth de marketplace `start`/`callback` → `features/stores/oauth.server.ts`
    - webhooks de entrada (Mercado Livre e mock) → `features/webhooks/webhooks.server.ts`
    - foto de perfil → `features/profile/avatar.server.ts`
    - anexos e chamados de suporte → `features/support/support.server.ts`, `attachments.server.ts`, `upload.ts`
    - exportação financeira (CSV) → `routes/api/financeiro/exportar.ts` + `features/reports/csv.ts` + `report-scope.server.ts`
    - admin → `routes/api/admin/**` + `features/admin/*`
  - **API pública v1** (`routes/api/v1/**`, `features/public-api/**`; guia em `docs/api.md`, decisão em `docs/decisions.md` de 2026-10-11):
    - cada operação é declarada com `defineApiEndpoint` (`endpoint.ts`: escopo, schemas Zod de entrada e resposta, handler) e executada por `run-endpoint.server.ts` + `request-steps.server.ts`; o OpenAPI 3.1 sai da mesma descrição (`openapi.ts`, `docs.server.ts`);
    - chaves `sb_live_` por organização, guardadas como SHA-256 (`api-key-secret.server.ts`, `authenticate.server.ts`, `api-keys.server.ts`), com escopos, expiração, revogação e no máximo 20 ativas;
    - rate limit de 120 req/min por chave em janela fixa no Postgres (`rate-limit.server.ts`), `Idempotency-Key` obrigatória em `POST`, guardada por 24 h (`idempotency.server.ts`);
    - erros `application/problem+json` (`problem.ts`);
    - endpoints em `endpoints/*.server.ts` com presenters (`*.presenter.ts`) que definem o que sai para fora;
    - eventos por outbox transacional (`api_events` + `webhook_deliveries`), lidos por cursor em `GET /events`;
    - webhooks de saída: URL validada em `webhook-rules.server.ts` e de novo no worker, antes de cada envio, em `apps/worker/src/lib/webhook-url-guard.ts` (com `shared/runtime/network-address.ts`); envio em `webhook-http.ts` e retentativas em `webhook-retry.ts`; segredo `whsec_` cifrado; assinatura HMAC-SHA256 em `SellBridge-Signature`, com timestamp e tolerância de 5 min.
  - Loja simulada: `routes/oauth/mock/autorizar.tsx`, `features/listings/mock-sale.server.ts` e o conector `packages/marketplaces/src/mock/` (HMAC em `codec.ts`). O registry (`packages/marketplaces/src/registry.ts`) troca o mock por um conector indisponível quando falta `mockWebhookSecret`.
  - Região e onboarding: `features/region/*` (`region.server.ts`, `coverage-change.ts`), `features/onboarding/*`, `components/region/*`.
  - Infra de servidor em `lib/server/`: `environment.ts`, `storage.ts` (disco local), `mailer.ts` (Resend, e-mail **só texto**), `queues.ts`, `http.ts`, `user-facing-error.ts`.
- **apps/worker**: BullMQ com os processors `publish-listing`, `stock-price-sync`, `token-refresh`, `webhook-event` (entrada) e `webhook-delivery` (saída); `lib/rate-limiter.ts` (token bucket **em memória por instância, por design**), `lib/store-access.ts`, `lib/webhook-url-guard.ts`, `lib/webhook-http.ts`, `lib/webhook-retry.ts`; health em `health.ts`; shutdown em `index.ts`.
- **packages/database**: Drizzle ORM + PostgreSQL 18. Schema em `src/schema/`, repositórios por tenant em `src/repositories/**`, SQL auxiliar em `repositories/sql/` (busca com `like` sobre `translate(lower(coluna))` em `search-pattern.ts`), pool em `client.ts`.
- **packages/marketplaces**: conectores Mercado Livre (`mercado-livre/`: OAuth, listings, orders, webhook, schemas Zod) e mock; cliente HTTP com retry e timeout em `http.ts`; erros em `errors.ts`.
- **packages/shared**: `domain/` (dinheiro, finanças, período, CEP, regras de anúncio e chamado), `runtime/` (`environment.ts`, `errors.ts`, `logger.ts`, `token-cipher.ts` AES-256-GCM, `file-signature.ts`, `http-body.ts`, `queues.ts`, `network-address`), `schemas/` (Zod das bordas), `public-api/`.
- Infra local: Postgres e Redis via `docker-compose.yml` (`pnpm services:up`). `.env` e `.env.*` são ignorados pelo git; só `.env.example` é versionado. Variáveis em branco contam como ausentes (`feee778`).

Regras da casa (aponte violações só quando afetarem os quatro eixos): sem `else`, early return, `async/await` sem `.then` encadeado, checagem explícita de null, **Zod em todas as bordas**, dinheiro em centavos inteiros, textos de produto em português, código, commits e PRs em inglês.

## Escopo

Todo o código de `apps/` e `packages/`, exceto `node_modules`, `routeTree.gen.ts`, `.output/`, `dist/` e outras saídas de build. Revise `seed/` e `testing/` só para segredos hardcoded e para garantir que não são importados em produção.

Ordem de prioridade:

1. `routes/api/v1/**` + `features/public-api/**` (superfície pública, autenticada por chave)
2. Demais handlers `*.server.ts` das rotas `api/**` (webhook anônimo, uploads, OAuth, exportação, admin)
3. `*.functions.ts` (server functions)
4. Worker (`processors/`, `lib/`)
5. `packages/marketplaces`
6. `packages/database` (repositórios, schema, índices, migrations)
7. `packages/shared/src/runtime` e `schemas`
8. Componentes e hooks do cliente

---

## 0. Regressão da revisão anterior

Para **cada um dos 39 achados** de `docs/reviews/2026-10-10-revisao-completa.md`, confira no código atual e marque: **Corrigido** (cite o commit ou arquivo:linha da correção e se há teste), **Parcial** (o que falta) ou **Aberto**. Não reabra um achado corrigido sem um cenário novo. Os commits `93453e5`, `285d414`, `8c52547` e `da416ea` (PR #19) corrigiram parte deles. Verifique com atenção:

- #1 XSS/open redirect em `oauth/mock/autorizar.tsx` e a rota acessível sem o mock configurado
- #2 promoção a admin sem e-mail verificado
- #3 timeout em todo `fetch` externo, incluindo leitura do corpo
- #4 webhook gravado mas não enfileirado
- #5 e #17 retry em `POST /items` e no refresh de token do ML
- #6 compare-and-swap nos tokens de loja
- #7, #8, #9, #14, #23 e #24 índices, `ORDER BY` do sync e índice único `listings(tenant_id, supplier_product_id)`
- #10 e #11 corpo bufferizado antes do limite (uploads e webhook)
- #12 `activeOrganizationId` revalidado contra a membership
- #13 headers de segurança
- #18 `priceForRule` em float

## 1. Sanitização e validação

**Bordas**

- [ ] Toda borda valida com Zod antes de usar o dado: query, params e corpo de cada handler `api/**`; `.validator(...)` de cada server function; entrada e **saída** de cada endpoint da API v1 (o schema de resposta é aplicado de fato ou só documenta?); payloads de webhook de entrada; respostas da API do Mercado Livre; dados de job BullMQ ao serem consumidos; variáveis de ambiente (web, worker, `shared/runtime/environment.ts`); search params das rotas do TanStack Router (`validateSearch`). Liste toda borda que confia em `as`, `any`, `!` ou `JSON.parse` sem schema.
- [ ] Erro de validação vira 400 (ou 422 com `issues` na API v1), nunca 500. Confirme que `ZodError`, JSON malformado, `Content-Type` errado e corpo vazio caem no caminho certo de `problem.ts`/`http.ts`.
- [ ] Schemas restritivos (Zod 4): `z.strictObject` onde campo extra indica abuso (o `z.object` padrão descarta extras sem avisar); `max` em toda string e todo array/record (inclusive para não passar do limite de 65.535 parâmetros do Postgres); `z.int().nonnegative().max(...)` para preço, estoque e quantidade (preço em `int4` estoura em 2.147.483.647); `z.enum` em vez de string livre; `z.uuid()` para IDs; `z.url()` **não basta** para URL que vira `href` ou redirect, pois aceita `javascript:`, `data:` e `vbscript:` (exija `protocol` `https:`/`http:` ou caminho relativo que comece com `/` e não com `//`).
- [ ] Normalização antes de comparar ou guardar: `trim`, `toLowerCase` em e-mail, `normalize("NFC")` em texto, CEP e documento só com dígitos. Comparações de e-mail (ex.: `ADMIN_EMAILS`) usam a mesma normalização dos dois lados.
- [ ] Paginação: `page` e `pageSize` com teto (telas até 48, API até 100); cursor de `GET /events` validado como inteiro, sem aceitar negativo ou não numérico.

**Dinheiro e números**

- [ ] Valores monetários em centavos inteiros do começo ao fim: `lib/currency-mask.ts`, `features/listings/profit.ts`, `features/catalog/use-price-rule-draft.ts`, `shared/schemas/catalog.ts` (`priceForRule`), `shared/domain/*`, relatórios, presenters da API v1 (`financial-totals.ts`) e CSV. Nada de float acumulado, `toFixed` para arredondar ou soma de valores em reais.
- [ ] Percentuais e taxas: arredondamento definido (para cima, para baixo, bancário) e testado nos limites.

**SQL**

- [ ] Todo `sql\`...\``do Drizzle interpola parâmetros; nenhum`sql.raw`, `sql.identifier`ou nome de coluna montado a partir de entrada do usuário.`sort`e`direction` vindos do cliente passam por enum/allowlist.
- [ ] `search-pattern.ts`: o escape de `\`, `%` e `_` bate com o caractere de escape padrão do `LIKE` no Postgres e o padrão recebe a mesma dobra de acentos que a coluna (`foldAccents` × `translate`/`unaccent`).

**Saída e XSS**

- [ ] `dangerouslySetInnerHTML`: liste todos (`components/ui/chart.tsx`, script de tema em `routes/__root.tsx`) e confirme que nenhum recebe dado do usuário, do marketplace ou da URL.
- [ ] `href`, `src`, `window.location.*`, `window.open` e `redirect()` com dado externo: bloqueie `javascript:` e redirects para outro domínio (open redirect). Atenção a `redirect_uri`, `returnTo`/`callbackURL` do Better Auth e links de anúncio (`permalink`) vindos do ML.
- [ ] Texto externo exibido: títulos de anúncio, mensagens e nomes de arquivo do suporte, notificações, toasts montados a partir de query string (ex.: `?erro=` em `lojas.tsx`), nomes de organização e de chave de API.
- [ ] HTML gerado no servidor (página de docs da API, e-mails, respostas de erro) escapa tudo que interpola.

**CSV, e-mail e logs**

- [ ] CSV injection em `features/reports/csv.ts`: células que começam com `=`, `+`, `-`, `@`, tab ou CR são neutralizadas; aspas, separador e quebras de linha escapados; BOM e encoding corretos para Excel pt-BR.
- [ ] E-mail (`mailer.ts`): CR/LF em `subject`/`to`, conteúdo do usuário que vira link clicável (phishing), comportamento quando o Resend falha (sem enumeração de contas no reset de senha).
- [ ] Logs (`shared/runtime/logger.ts`): nada de tokens, chaves de API (nem o segredo inteiro nem o hash), `whsec_`, senhas, cookies, `Authorization`, PII completa, `params` de `DrizzleQueryError` ou payloads inteiros de webhook. Confira os campos de `logger.error(..., { error })`.

**Uploads e arquivos**

- [ ] `avatar.server.ts`, `support/upload.ts`, `attachments.server.ts`: `file-signature.ts` usado de fato e cobrindo todos os tipos aceitos; limite de tamanho aplicado **enquanto o corpo é lido** (não depois de `request.formData()` ou `request.text()`; ver `http-body.ts`); quantidade de arquivos por request limitada; nome e chave gerados no servidor; SVG e HTML proibidos; download com `Content-Type` fixo, `Content-Disposition: attachment` com nome escapado (RFC 6266/5987) e `X-Content-Type-Options: nosniff`.
- [ ] Path traversal em `storage.ts`: `resolve` + `startsWith(root + sep)` cobre chave absoluta, `..`, symlink, caixa e letra de drive no Windows, bytes nulos e Unicode normalizado. A chave nunca vem crua do cliente.

## 2. Async e concorrência

**Promises e erros**

- [ ] Promises soltas: chamada async sem `await`, `return` ou tratamento, principalmente em handlers, callbacks de evento React, `onSuccess`/`onSettled` de mutations, processors, `setTimeout`/`setInterval` e listeners. Para cada `void promessa`, confirme que a função chamada trata os próprios erros. Rode o oxlint com as regras de promise (`no-floating-promises`, `no-misused-promises`) se estiverem disponíveis via `oxlint-tsgolint`.
- [ ] `catch` que só loga e segue: decida se o fluxo deveria falhar. `catch` que engole `AbortError` ou erro de validação sem distinguir de erro real.
- [ ] `Promise.all` em que uma falha deixa as outras operações pela metade (sem transação nem compensação) e `Promise.allSettled` cujos `rejected` ninguém olha.
- [ ] `unhandledRejection` e `uncaughtException` tratados no worker e no servidor web, com log e saída controlada.

**Paralelismo**

- [ ] Sequencial que deveria ser paralelo: `await` em loop sobre itens independentes. O inverso também: `Promise.all` sem limite batendo na API do ML ou esgotando o pool do Postgres (`client.ts`, `max: 10`). Exemplo: `listOrganizationWebhookEndpoints` faz uma query por endpoint dentro de `Promise.all`; o dashboard dispara cerca de 11 queries paralelas.
- [ ] `await` dentro de `.map`/`.forEach` (o `forEach` não espera).

**Race conditions e transações**

- [ ] Check-then-act (ler e depois escrever sem transação, sem `UPDATE ... WHERE` condicional ou sem índice único): estoque, preço, status de anúncio, publicação em lote (`catalog.functions.ts`), refresh de token concorrente, notificações lidas, **limite de 20 chaves de API e de endpoints de webhook** (o próprio `webhooks.server.ts` admite a corrida; avalie o impacto), **contador do rate limit** (`countApiRequest` é um upsert atômico ou leitura + escrita?), **claim de idempotência** (duas requisições simultâneas com a mesma `Idempotency-Key`: só uma executa? o corpo diferente com a mesma chave vira 422?), revogação de chave durante uma requisição em andamento.
- [ ] Transações: operações multi-tabela dentro de `database.transaction`; o outbox (`api_events` + `webhook_deliveries`) é gravado **na mesma transação** da mudança em todos os pontos que emitem evento (web e worker); nenhuma chamada HTTP externa, `enqueue` ou envio de e-mail **dentro** da transação; nível de isolamento e `FOR UPDATE` onde a leitura decide a escrita.
- [ ] Índices únicos que sustentam a idempotência: pedido por `(store, external_id)`, evento de webhook de entrada, entrega por `(event, endpoint)`, chave de idempotência por `(api_key, key)`.

**Timeouts e cancelamento**

- [ ] Todo `fetch` externo tem timeout que cobre também a leitura do corpo (`AbortSignal.timeout` combinado com o sinal do chamador via `AbortSignal.any`): `packages/marketplaces/src/http.ts`, `mercado-livre/oauth.ts`, `mailer.ts`, `mock-sale.server.ts` e o envio de webhooks em `processors/webhook-delivery.ts`.
- [ ] Retry só em operação idempotente: nada de repetir `POST /items` ou o refresh de token (o refresh token do ML é de uso único). Backoff exponencial com jitter, respeitando `Retry-After`.
- [ ] No cliente: `useEffect` com fetch sem cleanup (setState depois do unmount, resposta fora de ordem) na busca global, command palette, notificações, `use-notification-chime.ts` e `oauth/mock/autorizar.tsx`. Debounce e cancelamento na busca.

**Worker e BullMQ**

- [ ] Jobs idempotentes: reentrega não duplica pedido, anúncio, evento ou entrega de webhook. `jobId` determinístico onde há deduplicação. `attempts` e `backoff` definidos ao enfileirar (sem `attempts`, não há retry). Erro definitivo (4xx do ML, validação, loja desconectada) vira `UnrecoverableError`; `isFinal`/`attemptsMade` usados de fato.
- [ ] Jobs `stalled`: o que acontece com o estado no banco (`publishing`, entrega `sending`) quando o worker morre no meio? Há varredura que destrava?
- [ ] `webhook-delivery`: varredura de pendentes sem duplo envio entre instâncias (`FOR UPDATE SKIP LOCKED` ou claim atômico); backoff e número máximo de tentativas; endpoint que falha sempre é desativado ou só acumula entregas; timeout curto; corpo da resposta do integrador lido com limite (e nunca guardado inteiro).
- [ ] Concorrência dos workers coerente com o rate limiter (5/s fixo e em memória **por instância, por design**): a cota já é a fração por instância? 429 e `Retry-After` do ML alimentam o bucket?
- [ ] Shutdown (`apps/worker/src/index.ts`): `SIGTERM` e `SIGINT`, prazo máximo, `try/catch` em cada `close()`, fecha health server, workers, filas, conexão Redis compartilhada e pool do Postgres, sem deixar job pela metade sem reentrega.

**TanStack Query**

- [ ] Updates otimistas (`lib/optimistic.ts`, `lib/rewind.ts`, `use-listing-actions.ts`, hooks `use-*.ts` da API pública): `cancelQueries` antes, rollback no erro, `invalidateQueries` no `onSettled` (não só no `onSuccess`), duas mutações otimistas seguidas sem uma desfazer a outra.
- [ ] Polling (`listings.queries.ts`, notificações) com backoff e parada quando a aba está oculta ou o estado é final.

## 3. Performance

**Banco**

- [ ] N+1: query dentro de loop ou de `map` com `await` (ex.: entregas por endpoint de webhook, presenters que buscam relação item a item).
- [ ] `select` com colunas desnecessárias (ex.: `description` e `imageUrls` não usados no catálogo da região), `count(*)` exato em tabela grande a cada página, count e página em série quando podiam ser paralelos.
- [ ] Índices para os filtros e ordenações reais, sempre começando por `tenant_id`: pedidos, itens de pedido, anúncios e targets, notificações, webhooks de entrada, `api_events (tenant_id, sequence)`, `webhook_deliveries` (status + próxima tentativa, para a varredura), chaves de API por hash (único), contador de rate limit e idempotência (com limpeza por TTL). Confira as migrations, não só o schema.
- [ ] Tabelas que só crescem: `api_events`, `webhook_deliveries`, contador de rate limit, idempotência, webhooks de entrada, notificações. Há retenção/limpeza? A limpeza é em lote, sem travar a tabela?
- [ ] Busca `translate(lower(coluna)) like '%…%'` sem índice trigram (`pg_trgm`) de expressão = seq scan.
- [ ] Paginação por `OFFSET` em tabelas grandes (prefira keyset). Agregação no SQL, não em JS; período com teto (366 dias); CTE pesada recalculada várias vezes por tela (`orderFinanceCte`).
- [ ] Escrita a cada requisição da API v1: rate limit + idempotência + "último uso" da chave (gravado no máximo uma vez por minuto?). Quantas queries uma chamada `GET` simples faz no total? Meça.
- [ ] Sessão: sem `cookieCache` do Better Auth, cada server function busca a sessão no Postgres; `beforeLoad` encadeado (`getAppSession` → `getTenantRegion`) em toda navegação.

**Servidor e memória**

- [ ] Exportação CSV: carrega todas as linhas e monta a string inteira? Avalie streaming, teto de período/linhas e aviso quando trunca (hoje 20.000 linhas, sem aviso).
- [ ] Uploads e anexos lidos inteiros em memória (`readFile` em `storage.ts`): aceitável para o tamanho máximo? Streaming no download?
- [ ] Respostas grandes da API v1 com `pageSize` 100 e relações aninhadas: tamanho do JSON e custo de serialização.

**SSR e dados**

- [ ] Waterfalls em loaders e `beforeLoad`; uso de `lib/prefetch.ts`; `staleTime` (30 s global em `router.tsx`; `staleTime: 0` em `onboarding.tsx` é intencional?); dados duplicados entre SSR e cliente; preload por intent que dispara queries caras.

**React** (aplique a skill `vercel-react-best-practices`)

- [ ] Re-render por objeto ou função inline passado a componente memoizado; valor de context recriado a cada render (provider de tema, `components/theme/*`); efeitos que deveriam ser valor derivado; cálculos caros no render; listas grandes sem virtualização (catálogo, anúncios, pedidos, `data-table.tsx`); estado que deveria estar na URL.
- [ ] Gráficos (Recharts, `components/ui/chart.tsx`, `components/reports/*`, `cash-flow-chart.tsx`): `data` e formatters memoizados, sem re-render a cada resize. O mapa da região (`region-preview.tsx`, `current-region-card.tsx`): custo de render e de assets.
- [ ] Animações (`menu-icon-motion.tsx`, `field-motion.ts`) só com `transform`/`opacity` e respeitando `prefers-reduced-motion`.

**Bundle**

- [ ] Rode `pnpm --filter @sellbridge/web build` e confira: nenhum código de servidor (drizzle, bullmq, better-auth server, `node:*`, `*.server.ts`, `lib/server/*`) no bundle do cliente; tamanho dos maiores chunks (o `dashboard` tinha 447 KB, 125 KB gzip); imports que puxam bibliotecas inteiras (`@phosphor-icons/react`, `radix-ui`); rotas pesadas sem code-splitting; a página de docs da API carregando bibliotecas de CDN.

**Worker**

- [ ] Lotes de sync de estoque e preço dimensionados, com `ORDER BY` estável (`synced_at`/`sync_attempted_at nulls first`), sem buscar o catálogo inteiro a cada job e sem um item com erro travar a fila.

## 4. Segurança

**Isolamento multi-tenant (prioridade máxima)**

- [ ] Toda query de repositório filtra por `tenantId` vindo do contexto do middleware, da sessão ou da **chave de API**, nunca do input. Procure IDs (store, listing, order, product, attachment, ticket, notification, webhook endpoint, delivery, api key, event) aceitos do cliente e usados sem conferir que pertencem ao tenant (IDOR). Foco: `handleDownloadAttachment`, exportação (`buildReportScope`), avatar, ações em lote, `GET/PATCH /api/v1/listings/$listingId`, `GET /api/v1/orders/$orderId`, `webhook-endpoints/$id`, revogação de chave de API, região.
- [ ] Recursos globais (catálogo de fornecedores, região, reputação de fornecedor) não vazam dado de outro tenant por agregação.
- [ ] No worker, `store-access.ts` garante que o `tenantId` do job bate com a loja; `webhook-event` mapeia `user_id` do ML para a loja e o tenant certos (a mesma conta do ML conectada em dois tenants?).
- [ ] Escreva (em modo `correção`) ou proponha um teste que tente acessar recurso de outro tenant por cada superfície: server function, rota `api/**` e API v1.

**Autenticação e autorização do app** (aplique a skill `better-auth-best-practices`)

- [ ] Toda server function sensível usa `tenantMiddleware`/`adminMiddleware`; liste as que não usam e justifique. Handlers `api/**` chamam `requireTenantSession` ou equivalente. `features/admin` exige papel admin **no servidor**; papéis na organização (owner, admin, member) respeitados em ações destrutivas (desconectar loja, criar ou revogar chave de API, criar webhook, excluir).
- [ ] Sessão e organização ativa: `customSession` e `requireTenantSession` usam a "primeira organização" como fallback; com várias organizações, a escolha é determinística? `activeOrganizationId` é revalidado contra a membership atual (membro removido perde acesso na hora)?
- [ ] Better Auth: `secret` forte vindo do ambiente; `trustedOrigins`; cookies `Secure`/`HttpOnly`/`SameSite` e prefixo `__Secure-` em produção; rate limit de login, cadastro e reset (padrão da versão instalada, armazenamento em memória por instância, IP vindo de `x-forwarded-for` confiável?); verificação de e-mail; expiração e revogação de sessão; enumeração de usuários em mensagens e tempos de resposta; plugin `admin` (impersonation, ban, quais rotas ficam bloqueadas durante a impersonação); promoção a admin só com e-mail verificado; tamanho de `name` validado no cadastro.

**API pública v1**

- [ ] Autenticação: o hash da chave é buscado por índice único e a comparação não depende de `===` sobre o segredo; chave revogada, expirada ou da organização apagada recebe 401 na hora; mensagens de 401 não distinguem "não existe" de "revogada"; formato do `Authorization` validado (sem `Bearer` duplo, espaços, chave em query string).
- [ ] Escopos: cada `defineApiEndpoint` declara escopo e `run-endpoint` o aplica **antes** do handler; nenhum endpoint de escrita aceita escopo de leitura; quem cria a chave não pode dar escopo que ele mesmo não tem.
- [ ] O segredo da chave e o `whsec_` aparecem uma única vez na resposta de criação e nunca em listagem, log, OpenAPI de exemplo ou mensagem de erro; o prefixo visível não reduz a entropia de forma relevante.
- [ ] Presenters: só expõem campos pensados para fora (sem `tenantId` interno, tokens, custos de fornecedor se não for intenção, IDs de outras organizações, stack trace).
- [ ] Rate limit: janela fixa permite 2× o limite na virada do minuto (aceitável?); o contador é atômico; a checagem acontece **antes** de qualquer trabalho caro; requisição sem chave ou com chave inválida também é limitada (por IP), para evitar enumeração e flood de queries por hash.
- [ ] Idempotência: chave ligada à chave de API **e** ao método + caminho + hash do corpo; reuso com corpo diferente vira erro; respostas 5xx liberam a chave; resposta guardada não inclui segredo; tamanho máximo da `Idempotency-Key`.
- [ ] Problem details (`problem.ts`): `detail` nunca carrega mensagem de exceção interna, SQL ou caminho de arquivo; `requestId` presente para correlacionar com o log.
- [ ] Página `/api/v1/docs` (`docs.server.ts`, HTML montado no servidor que carrega o Scalar do jsDelivr) e `/openapi.json`: públicas por decisão? Não revelam rotas internas; o script de CDN tem versão fixa, `integrity` (SRI) e `crossorigin`, e cabe na CSP.
- [ ] CORS da API: a API é para servidor (a chave não deve rodar no navegador). Confira se há `Access-Control-Allow-Origin: *` com credenciais ou reflexo de `Origin`.

**Webhooks de saída (SSRF)**

- [ ] `webhook-rules.server.ts` e `webhook-url-guard.ts`: bloqueiam IPv4 e IPv6 privados, loopback, link-local (`169.254.169.254`, metadados de nuvem), CGNAT, `0.0.0.0`, IPv4 mapeado em IPv6 (`::ffff:127.0.0.1`), formas numéricas alternativas (`2130706433`, `0x7f.1`, octal), nomes que resolvem para IP privado e **DNS rebinding** (o IP validado é o mesmo usado na conexão, ou o `fetch` resolve de novo?).
- [ ] O envio **não segue redirects** (`redirect: "manual"`) ou valida cada salto; não envia cookies nem cabeçalhos internos; limita o tamanho da resposta lida.
- [ ] `WEBHOOK_ALLOW_PRIVATE_URLS` e `NODE_ENV !== "production"` não podem ficar ligados em produção por engano; o boot falha ou avisa.
- [ ] Assinatura: HMAC-SHA256 sobre `timestamp.corpo_cru`, segredo por endpoint, timestamp no cabeçalho, documentação de verificação com comparação em tempo constante e tolerância de 5 min; rotação de segredo sem janela de falha.

**Webhooks de entrada**

- [ ] Mock: HMAC com `timingSafeEqual` sobre o **corpo cru**, tratando tamanhos diferentes sem lançar exceção.
- [ ] Mercado Livre (não assina): o payload só serve de gatilho e o recurso é **re-buscado na API** com o token da loja; o `resource` é validado contra regex/allowlist antes de virar caminho (SSRF); deduplicação e replay; resposta rápida com processamento enfileirado; limite de tamanho do corpo durante a leitura; eventos inválidos não são gravados com payload inteiro; flood anônimo não enche a tabela.

**OAuth de marketplace**

- [ ] `features/stores/oauth.server.ts` e `mercado-livre/oauth.ts`: `state` aleatório, vinculado à sessão e ao tenant, com expiração e uso único; PKCE S256 de ponta a ponta; `redirect_uri` fixo; o callback associa a loja ao tenant **da sessão**; `$marketplace` validado contra allowlist; erro do provedor não vira toast com texto livre.
- [ ] Loja simulada em produção: sem `mockWebhookSecret`, a rota `oauth/mock/autorizar`, `approveMockAuthorization` e `mock-sale.server.ts` também ficam inacessíveis (404), não só o conector; o placeholder de `.env.example` não passa na validação de produção.

**Segredos e criptografia**

- [ ] `token-cipher.ts` (AES-256-GCM): IV aleatório de 12 bytes por cifragem, auth tag verificada, chave do ambiente com tamanho validado, prefixo de versão e plano de rotação. Os mesmos cuidados valem para o `whsec_` cifrado.
- [ ] Tokens de marketplace nunca vão ao cliente nem ao log; ao desconectar a loja, são apagados e, se o ML permitir, revogados.
- [ ] Nada hardcoded fora de `.env.example` e do seed de desenvolvimento; o ambiente falha no boot se faltar variável obrigatória em produção (lembre que variável em branco conta como ausente). Procure no histórico:
      `git log -p -G "(secret|token|api[_-]?key|password|sb_live_|whsec_)\s*[:=]" -- . ":!pnpm-lock.yaml"`
- [ ] Comparações de segredo em tempo constante; `Math.random` nunca usado para segredo, `state`, ID de arquivo ou token.

**Web e transporte**

- [ ] CSRF: rotas `POST`/`PATCH`/`DELETE` cruas com cookie (`api/perfil/foto`, `api/suporte/chamados`, `api/admin/**`) e server functions exigem `SameSite` e checagem de `Origin`. Exceções legítimas: webhook de entrada (assinado ou re-buscado) e API v1 (Bearer, sem cookie; confirme que ela **ignora** o cookie de sessão).
- [ ] Headers: CSP compatível com o script inline de tema (nonce ou hash) e com a página de docs, `frame-ancestors 'none'`, `Referrer-Policy`, HSTS, `nosniff`, `Permissions-Policy`. Onde são aplicados (middleware global do Start, servidor, proxy)?
- [ ] Erros (`lib/errors.ts`, `lib/server/http.ts`, `user-facing-error.ts`, `shared/runtime/errors.ts`, `ShallowErrorPlugin` do Start): o cliente nunca vê stack trace, SQL, `params` ou caminho interno.
- [ ] `x-forwarded-for`/`x-forwarded-proto` só são confiáveis atrás de proxy conhecido.

**Abuso e DoS**

- [ ] Rate limit em upload, exportação, busca global, criação de chamado e mensagem, auth, criação de chave de API e de endpoint de webhook, e requisições não autenticadas à API v1.
- [ ] Teto de `limit`/`pageSize`, de período e de itens em ações em lote em todos os schemas.
- [ ] Regex aplicada a entrada do usuário sem backtracking catastrófico (ReDoS).
- [ ] JSON profundamente aninhado ou gigante em corpo de request.

**Dependências e cadeia de suprimentos**

- [ ] `pnpm audit --prod` e `pnpm audit`: reporte vulnerabilidades altas e críticas com caminho de dependência, separando produção de dev/build.
- [ ] Build scripts permitidos (`onlyBuiltDependencies` / decisão de 2026-10-09), Dependabot configurado, lockfile versionado, versões sem `*` ou `latest`.

---

## Como trabalhar

1. **Mapeie as bordas primeiro** e inclua o mapa no relatório:
   - cada rota `api/**` → handler `*.server.ts` → autenticação → schema → repositório;
   - cada endpoint da API v1 → escopo → schema de entrada e resposta → presenter;
   - cada server function → middleware → schema;
   - cada processor do worker → schema do job → `attempts`/`backoff` → efeitos externos.
2. **Use subagentes em paralelo**, um por eixo (ou por superfície: API v1, worker, web, pacotes), cada um com este prompt e o mapa de bordas. Unifique os achados vistos por mais de um eixo.
3. **Confirme cada achado lendo o código** até o fim da cadeia. Quando der, prove com um teste local (vitest ou um `curl` contra o dev server) em vez de só ler.
4. **Rode e reporte**, com o resultado de cada um:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm check:no-else`
   - `pnpm format:check`
   - `pnpm test` (os testes de integração exigem Postgres e Redis via `pnpm services:up`; se o Docker não estiver disponível, diga o que não rodou)
   - `pnpm --filter @sellbridge/web build` (bundle)
   - `pnpm test:e2e`, se o ambiente permitir
   - `pnpm audit --prod`
5. **Meça quando falar de performance**: `EXPLAIN (ANALYZE, BUFFERS)` das queries suspeitas com o seed carregado, contagem de queries por request, tamanho de chunk. Sem número, o achado de performance é no máximo Média.

## Modo `correção`

- Uma branch por rodada (`fix/review-AAAA-MM-DD`), nunca direto na `main`.
- Para cada achado: primeiro um teste que falha (vitest para shared, database, worker e marketplaces; Playwright para auth, IDOR e fluxos), depois a correção mínima, depois o teste passando.
- Siga as regras da casa (sem `else`, early return, Zod nas bordas, centavos inteiros) e as skills: `codebase-design` para mudanças estruturais, `better-auth-best-practices` para auth, `vercel-react-best-practices` para React, `playwright-best-practices` para E2E e `caveman-commit` para as mensagens (Conventional Commits, em inglês).
- Mudança de schema vira migration gerada (`pnpm database:generate`), revisada à mão e testada contra um banco com dados (índice em tabela grande: `CREATE INDEX CONCURRENTLY`).
- Mudança de comportamento visível (API v1, e-mail, telas) atualiza `docs/api.md` e, se for decisão, `docs/decisions.md`.
- A API v1 só recebe mudanças compatíveis; quebra de contrato precisa ser sinalizada antes de implementar.
- Ao terminar, rode todas as checagens do passo 4 e atualize o relatório marcando cada achado como **Corrigido** (commit) ou **Pendente** (motivo).

## Formato da resposta (modos `auditoria` e `diff`)

Responda em português e salve o relatório em `docs/reviews/AAAA-MM-DD-revisao-completa.md`.

1. **Resumo executivo** (5 linhas no máximo) e **placar por eixo** (Crítica / Alta / Média / Baixa).
2. **Checagens**: resultado de cada comando do passo 4.
3. **Regressão**: tabela com os 39 achados anteriores (`#`, status, evidência).
4. **Mapa de bordas** (resumido).
5. **Achados novos**, ordenados por severidade:

| #   | Severidade | Eixo | Arquivo:linha | Problema | Cenário de falha | Correção sugerida | Teste que pegaria |
| --- | ---------- | ---- | ------------- | -------- | ---------------- | ----------------- | ----------------- |

Severidades:

- **Crítica**: vazamento entre tenants, bypass de autenticação ou de escopo, execução de código, SSRF para rede interna, segredo exposto.
- **Alta**: XSS ou CSV injection explorável, webhook forjável, open redirect usado em fluxo de auth, corrupção ou duplicação de dados por race condition, perda de jobs ou de eventos, cobrança errada.
- **Média**: falta de validação sem exploração direta, N+1 ou seq scan em tela principal medido, promise solta com efeito real, DoS por um usuário autenticado.
- **Baixa**: melhorias defensivas, micro-otimizações, higiene.

Para Crítica e Alta, inclua o trecho de código da correção no estilo da casa. Termine com:

- **O que está bem feito**, para não regredir (com arquivo).
- **Top 5 ações** em ordem de prioridade, com esforço estimado (P/M/G) e os achados que cada uma fecha.
- **Lacunas de teste**: quais riscos merecem teste automatizado e em qual camada.
- **Atualizações deste prompt**: o que mudou na arquitetura e deveria entrar na seção "Contexto do projeto".
