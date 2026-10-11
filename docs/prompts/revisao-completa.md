# Prompt — Revisão completa: sanitização, async, performance e segurança

> Cole este prompt numa sessão nova do Claude Code na raiz do repositório.
> Para revisar só um diff, troque o "Escopo" por `git diff main...HEAD`.

---

Você é um revisor sênior de segurança e performance. Faça uma **revisão completa e somente leitura** do monorepo SellBridge (não edite arquivos) cobrindo quatro eixos: **sanitização de entrada/saída, código assíncrono, performance e segurança**. Leia o código de verdade; não presuma que algo é seguro porque o nome sugere — e também não reporte como ausente algo que já existe: procure a mitigação antes.

## Contexto do projeto

- **Monorepo** pnpm + Turborepo, Node >= 24, TypeScript 7, ESM.
- **apps/web** — TanStack Start (SSR) + React 19, TanStack Router/Query/Form/Table, Better Auth (plugins `organization` = multi-tenant e `admin`; config em `apps/web/src/lib/server/auth.ts`), Zod 4, Recharts, Radix/shadcn.
  - Server functions em `apps/web/src/features/**/*.functions.ts`, validadas com `.validator(...)` e protegidas por `tenantMiddleware` / `adminMiddleware` (`lib/server/middleware.ts`, `lib/server/tenant-session.ts`).
  - Rotas HTTP cruas em `apps/web/src/routes/api/**` são finas: delegam para handlers em `features/**/*.server.ts` — **revise os handlers, não só o arquivo de rota**:
    - OAuth `start`/`callback` → `features/stores/oauth.server.ts`
    - webhooks → `features/webhooks/webhooks.server.ts`
    - foto de perfil → `features/profile/avatar.server.ts`
    - anexos e chamados de suporte → `features/support/support.server.ts`, `attachments.server.ts`, `upload.ts`
    - exportação financeira (CSV) → `routes/api/financeiro/exportar.ts` + `features/reports/csv.ts` + `report-scope.server.ts`
  - Loja simulada: rota `routes/oauth/mock/autorizar.tsx`, `features/listings/mock-sale.server.ts` e o conector `packages/marketplaces/src/mock/` (assinatura HMAC em `codec.ts`). O registry (`packages/marketplaces/src/registry.ts`) troca o mock por um conector indisponível quando falta `mockWebhookSecret`.
  - Infra de servidor em `apps/web/src/lib/server/`: `environment.ts`, `storage.ts` (disco local), `mailer.ts` (Resend, e-mail **só texto**), `queues.ts`, `http.ts`.
- **apps/worker** — BullMQ: `publish-listing`, `stock-price-sync`, `token-refresh`, `webhook-event`; `lib/rate-limiter.ts` (token bucket **em memória por instância, por design**), `lib/store-access.ts`; shutdown em `src/index.ts`.
- **packages/database** — Drizzle ORM + PostgreSQL 18; repositórios em `src/repositories/**`, SQL auxiliar em `repositories/sql/` (busca com `like` sobre `translate(lower(coluna))` em `search-pattern.ts`).
- **packages/marketplaces** — conectores Mercado Livre (`mercado-livre/`: OAuth, listings, orders, webhook, schemas Zod) e mock; cliente HTTP em `http.ts`.
- **packages/shared** — `errors`, `logger`, schemas Zod (`src/schemas/`) e utilitários de runtime em `src/runtime/`: `environment.ts`, `token-cipher.ts` (AES-256-GCM dos tokens de marketplace), `file-signature.ts` (magic bytes), `http-body.ts`, `queues.ts`.
- Infra local: Postgres e Redis via `docker-compose.yml`. `.env` e `.env.*` são ignorados pelo git; só `.env.example` é versionado.

Regras de estilo da casa (aponte violações só quando afetarem os eixos abaixo): sem `else`, early return, `async/await` (sem `.then` encadeado), checagem explícita de null, **Zod em todas as bordas**.

## Escopo

Todo o código de `apps/` e `packages/`, exceto `node_modules`, `routeTree.gen.ts`, saídas de build e `seed/` (revise `seed/` só para segredos hardcoded). Priorize nesta ordem: handlers `*.server.ts` das rotas `api/**` → `*.functions.ts` → worker → `packages/marketplaces` → `packages/database` → `packages/shared/src/runtime` → componentes.

---

## 1. Sanitização e validação

- [ ] **Toda borda valida com Zod**: query/params/corpo de cada handler de `api/**` (ex.: `financialSearchSchema.parse` na exportação), `.validator(...)` de cada server function, payloads de webhook, respostas da API do Mercado Livre, dados de jobs BullMQ ao serem consumidos no worker, variáveis de ambiente (web, worker e `shared/runtime/environment.ts`). Liste qualquer borda que confia em `as`, `any` ou `JSON.parse` sem schema. Erro de validação deve virar 400, não 500.
- [ ] Schemas restritivos (Zod 4): objetos estritos onde campos extras indicam abuso (`z.strictObject`; o padrão `z.object` descarta extras silenciosamente), `max` em strings e arrays, `z.int().nonnegative()` para preços/estoque/quantidades, enums em vez de `string` livre, `z.uuid()` para IDs.
- [ ] **Dinheiro**: valores monetários em inteiros (centavos) ou decimal — nunca `float` acumulado. Ver `lib/currency-mask.ts`, `features/listings/profit.ts`, `features/catalog/use-price-rule-draft.ts`, `shared/schemas/catalog.ts` e os relatórios.
- [ ] **SQL**: todo `sql\`...\``do Drizzle interpola parâmetros, nunca`sql.raw`com entrada do usuário. Em`search-pattern.ts`, confirme que o escape de `\`, `%` e `_` bate com o caractere de escape padrão do `LIKE` no Postgres (`\`) e que o lado do padrão recebe a mesma dobra de acentos que a coluna (`foldAccents` × `translate`). Campos de ordenação vindos do cliente (`sort`, `direction`) precisam de enum/allowlist.
- [ ] **Saída / XSS**: os dois `dangerouslySetInnerHTML` conhecidos (`components/ui/chart.tsx` e o script de tema em `routes/__root.tsx`) não podem receber dado do usuário — confira de onde vêm cores/IDs no `chart.tsx`. Procure também `href`/`src` montados com dados do usuário ou do marketplace (bloquear `javascript:`), títulos de anúncios, mensagens de suporte, notificações e toasts com conteúdo externo.
- [ ] **CSV injection** em `features/reports/csv.ts`: células começando com `=`, `+`, `-`, `@`, tab ou CR precisam ser neutralizadas; aspas, separador e quebras de linha escapados.
- [ ] **E-mail** (`mailer.ts`, só texto): CR/LF em `subject`/`to` vindos do usuário, conteúdo do usuário que vira link clicável em clientes de e-mail (phishing), e o que acontece quando o Resend falha.
- [ ] **Uploads** (`avatar.server.ts`, `support/upload.ts`, `attachments.server.ts`): `file-signature.ts` é usado de fato e cobre todos os tipos aceitos; limite de tamanho aplicado **antes** de ler o corpo inteiro (ver `http-body.ts`); nome/chave do arquivo gerados no servidor; SVG proibido; download com `Content-Type` fixo, `Content-Disposition` e `X-Content-Type-Options: nosniff`.
- [ ] **Path traversal** em `storage.ts`: a checagem `resolve` + `startsWith(root + sep)` cobre chaves absolutas, `..`, symlinks e diferenças de caixa/drive no Windows? Confirme que a chave nunca vem crua do cliente.
- [ ] Logs (`@sellbridge/shared/logger`) não registram tokens, senhas, cookies, PII completa ou payloads inteiros de webhook.

## 2. Async e concorrência

- [ ] **Promises soltas**: chamadas async sem `await`, `return` ou `.catch`, especialmente em handlers, callbacks de evento React, `onSuccess` de mutations e processors. Avalie cada `void promise` (ex.: `process.once("SIGTERM", () => void shutdown(...))`) e confirme que a função chamada trata os próprios erros.
- [ ] `catch` que só loga e segue: decida se o fluxo deveria falhar (ex.: `setActiveOrganization` em `tenant-session.ts` — se falhar, cada request repete a busca da organização?).
- [ ] **Sequencial que deveria ser paralelo**: `await` em loop sobre itens independentes (use `Promise.all`/`allSettled` com limite de concorrência). E o inverso: `Promise.all` sem limite batendo na API do Mercado Livre ou esgotando o pool do Postgres.
- [ ] **Race conditions / check-then-act**: leitura seguida de escrita sem transação ou sem `UPDATE ... WHERE` condicional — estoque, preço, status de anúncio, publicação em lote (`catalog.functions.ts`, `publish-listing.server.ts`), refresh de token concorrente (dois jobs usando o mesmo refresh token), notificações lidas.
- [ ] **Transações**: operações multi-tabela dentro de `db.transaction`; nenhuma chamada HTTP externa _dentro_ da transação.
- [ ] **Timeouts**: toda chamada HTTP externa tem `AbortSignal.timeout` — `packages/marketplaces/src/http.ts`, `mercado-livre/oauth.ts` e o `fetch` do Resend em `mailer.ts`.
- [ ] **Worker / BullMQ**: jobs idempotentes (reentrega não duplica pedido/anúncio — há testes em `publish-listing.test.ts`; confira os outros processors), `jobId` determinístico para deduplicar webhooks, `attempts` + `backoff` definidos ao enfileirar (o worker loga `job.opts.attempts ?? 1`: onde não há `attempts`, não há retry), erro definitivo como `UnrecoverableError`, concurrency coerente com o rate limiter, jobs `stalled`.
- [ ] **Shutdown** (`apps/worker/src/index.ts`): já fecha health server, workers e filas; confirme que também fecha a conexão Redis compartilhada e o pool do Postgres, tem prazo máximo, trata `SIGINT` e não deixa job pela metade sem reentrega.
- [ ] **Rate limiter**: é em memória por instância _por design_. Verifique se a cota configurada já é a fração por instância (cota do marketplace ÷ número de workers) e se respostas 429/`Retry-After` do marketplace são respeitadas além do bucket local.
- [ ] **Cancelamento no cliente**: `useEffect` com fetch sem cleanup gera setState após unmount ou resposta fora de ordem (busca global, command palette, notificações, `oauth/mock/autorizar.tsx`).
- [ ] TanStack Query: updates otimistas (`lib/optimistic.ts`, `lib/rewind.ts`) fazem rollback no erro e `invalidateQueries` no settle; `cancelQueries` antes do update otimista.

## 3. Performance

- [ ] **Banco**: N+1 (query dentro de loop / `map` com `await`), `select` de colunas desnecessárias, paginação por `OFFSET` em tabelas grandes (prefira keyset), índices para os filtros reais — `tenant_id` + colunas de filtro/ordenação em pedidos, anúncios, notificações e webhooks. A busca usa `translate(lower(coluna)) like '%…%'`: sem índice trigram (`pg_trgm`) de expressão, isso é seq scan.
- [ ] Relatórios (`repositories/reports.ts`, `sql/counted-orders.ts`, `time-window.ts`): agregação no SQL, não em JS; período com limite máximo.
- [ ] Exportação CSV: hoje carrega todas as linhas (`exportOrderFinancials`) e monta a string inteira (`buildFinancialCsv`). Avalie streaming e um teto de período/linhas.
- [ ] Uploads/anexos lidos inteiros em memória (`readFile` em `storage.ts`) — aceitável dado o tamanho máximo permitido?
- [ ] **SSR / dados**: waterfalls de loaders, uso de prefetch (`lib/prefetch.ts`), `staleTime` (padrão global de 30 s em `router.tsx`; `staleTime: 0` em `onboarding.tsx` é intencional?), dados duplicados entre SSR e cliente.
- [ ] **React** (aplique a skill `vercel-react-best-practices`): re-renders por objetos/funções inline passados a componentes memoizados, listas grandes sem virtualização (catálogo, anúncios, pedidos), cálculos caros no render, valor de context recriado a cada render (`theme-provider`), efeitos que deveriam ser valor derivado.
- [ ] **Bundle**: código só de servidor (drizzle, bullmq, better-auth server, `*.server.ts`, `lib/server/*`) vazando para o bundle do cliente; imports que puxam bibliotecas inteiras; rotas pesadas sem code-splitting. Confirme com a saída de `pnpm build`.
- [ ] Gráficos (Recharts, `components/ui/chart.tsx`, `components/reports/*`): datasets e formatters memoizados, re-render por resize.
- [ ] Worker: lotes de sync de estoque/preço dimensionados, sem buscar o catálogo inteiro a cada job.

## 4. Segurança

- [ ] **Isolamento multi-tenant (prioridade máxima)**: toda query de repositório filtra por `tenantId` vindo do contexto do middleware/sessão — **nunca** do input. Procure IDs (store, listing, order, attachment, notification, webhook) aceitos do cliente e usados sem conferir que pertencem ao tenant (IDOR). Foco em `handleDownloadAttachment`, exportação financeira (`buildReportScope`), avatar e ações em lote. No worker, `store-access.ts` deve garantir que o `tenantId` do job bate com a loja.
- [ ] Toda server function sensível usa `tenantMiddleware`/`adminMiddleware`; liste as que não usam e justifique. Handlers de `api/**` chamam `requireTenantSession` (ou equivalente)? `features/admin` exige papel admin no servidor? Papéis dentro da organização (owner/member) são respeitados?
- [ ] **Sessão e organização ativa**: `auth.ts` (customSession, ~linha 143) e `requireTenantSession` usam a "primeira organização" como fallback. Com várias organizações, isso escolhe a certa? `activeOrganizationId` é revalidado contra a membership atual (usuário removido da organização perde acesso na hora)?
- [ ] **Better Auth** (aplique a skill `better-auth-best-practices`): `secret` forte vindo do ambiente, `trustedOrigins`, cookies `Secure`/`HttpOnly`/`SameSite`, rate limit de login/registro/reset (o projeto não configura `rateLimit` explicitamente — confira o padrão da versão instalada e se ele vale em produção com várias instâncias), verificação de e-mail, expiração e revogação de sessão, enumeração de usuários nas mensagens de erro, proteção do plugin `admin` (impersonation).
- [ ] **OAuth de marketplace** (`features/stores/oauth.server.ts`, `mercado-livre/oauth.ts`): `state` aleatório, vinculado à sessão, com expiração e uso único; PKCE (há `createHash` em `oauth.ts` — confirme o S256 de ponta a ponta); `redirect_uri` fixo, sem open redirect por parâmetro; o callback associa a loja ao tenant **da sessão**; `$marketplace` validado contra allowlist.
- [ ] **Loja simulada em produção**: confirme que, sem `mockWebhookSecret`, a rota `oauth/mock/autorizar`, `approveMockAuthorization` e `mock-sale.server.ts` também ficam inacessíveis (não só o conector), e que `.env.example` não induz a habilitá-la em produção.
- [ ] **Tokens de marketplace**: `token-cipher.ts` (AES-256-GCM) — IV aleatório de 12 bytes por cifragem, auth tag verificada, chave vinda do ambiente com tamanho validado, plano de rotação; tokens nunca enviados ao cliente nem logados; revogados/apagados ao desconectar a loja.
- [ ] **Webhooks** (`features/webhooks/webhooks.server.ts`, `mercado-livre/webhook.ts`, `repositories/webhooks.ts`): o mock usa HMAC com `timingSafeEqual` (confirme que compara o **corpo cru** e trata tamanhos diferentes sem lançar exceção). O Mercado Livre não assina notificações: verifique que o payload só serve de gatilho e que o recurso é **re-buscado na API** com o token da loja, que `user_id` é mapeado para a loja/tenant certos, que há deduplicação/replay, resposta rápida com processamento enfileirado e limite de tamanho do corpo.
- [ ] **SSRF**: alguma URL vinda de payload externo (`resource` do webhook, imagens de produto, avatar) é buscada pelo servidor? Se sim, há allowlist de host e só caminho relativo concatenado à base da API?
- [ ] **CSRF**: rotas `POST`/`DELETE` cruas (`api/perfil/foto`, `api/suporte/chamados`) e server functions protegidas (SameSite + checagem de `Origin`)? O webhook é a exceção legítima.
- [ ] **Headers HTTP**: CSP (compatível com o script inline de tema — nonce ou hash), `frame-ancestors`, `Referrer-Policy`, HSTS, `nosniff`. Erros (`lib/errors.ts`, `lib/server/http.ts`, `shared/runtime/errors.ts`) não vazam stack trace, SQL ou detalhes internos.
- [ ] **Segredos**: nada hardcoded fora de `.env.example` e do seed de desenvolvimento; ambiente falha no boot se faltar variável obrigatória em produção; senhas do `docker-compose.yml` são só locais. Procure segredos no histórico com `git log -p -G "(secret|token|api[_-]?key|password)\s*[:=]" -- . ":!pnpm-lock.yaml"`.
- [ ] **Abuso / DoS**: rate limit em upload, exportação, busca global, criação de chamado e auth; teto de `limit`/`pageSize` nos schemas; regex aplicada a entrada do usuário sem risco de ReDoS.
- [ ] **Dependências**: rode `pnpm audit --prod` e reporte vulnerabilidades altas/críticas com caminho de dependência.

---

## Como trabalhar

1. Mapeie as bordas primeiro: liste cada rota `api/**` com seu handler `*.server.ts`, cada server function com middleware e schema, e cada processor do worker com o schema do job. Use subagentes em paralelo por eixo se ajudar.
2. Para cada achado, **confirme lendo o código** (siga a chamada até o repositório/SQL). Descarte o que for teórico ou já mitigado em outra camada — e diga onde está a mitigação.
3. Quando possível, descreva um cenário de reprodução concreto (request, payload, sequência de jobs).
4. Rode e reporte: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (para o bundle) e `pnpm audit --prod`. Os testes de integração do banco exigem `DATABASE_URL` (Postgres via `pnpm services:up`); se o Docker não estiver disponível, diga o que não rodou.

## Formato da resposta

Responda em português. Comece com um resumo executivo (5 linhas no máximo) e um placar por eixo. Depois, uma tabela de achados ordenada por severidade:

| #   | Severidade | Eixo | Arquivo:linha | Problema | Cenário de falha | Correção sugerida |
| --- | ---------- | ---- | ------------- | -------- | ---------------- | ----------------- |

Severidades:

- **Crítica** — vazamento entre tenants, bypass de auth, execução de código, segredo exposto.
- **Alta** — XSS/CSV injection explorável, webhook forjável, corrupção de dados por race condition, perda de jobs.
- **Média** — falta de validação sem exploração direta, N+1 em tela principal, promise solta com efeito real.
- **Baixa** — melhorias defensivas, micro-otimizações, higiene.

Para Crítica e Alta, inclua um trecho de código com a correção. Termine com:

- **O que está bem feito** (para não regredir).
- **Top 5 ações** em ordem de prioridade, com esforço estimado (P/M/G).
- **Lacunas de teste**: quais desses riscos merecem teste automatizado (vitest para repositório/worker/shared, Playwright para fluxos de auth/IDOR).
