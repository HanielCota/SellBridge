# Revisão completa — sanitização, async, performance e segurança

Data: 2026-10-10 · Branch: `feat/region-map-mark` · Prompt: [docs/prompts/revisao-completa.md](../prompts/revisao-completa.md)

## Resumo executivo

A base está bem cuidada: o isolamento entre tenants está coberto em todos os repositórios, o OAuth tem `state` atômico e PKCE S256, os tokens são cifrados com AES-256-GCM, o CSV é neutralizado e os uploads são conferidos por magic bytes. Os riscos reais estão em quatro pontos: (1) um XSS e open redirect na tela de OAuth simulado, acessível em produção; (2) promoção a admin só pelo e-mail, sem verificação; (3) o worker sem timeout HTTP e com escritas sem condição, o que pode duplicar anúncios, perder webhooks e ressuscitar lojas desconectadas; (4) índices faltando em `order_items`/`listings` e uma busca sem trigram.

**Placar por eixo**

| Eixo        | Crítica | Alta | Média | Baixa |
| ----------- | ------- | ---- | ----- | ----- |
| Segurança   | 0       | 2    | 4     | 4     |
| Async       | 0       | 4    | 4     | 5     |
| Performance | 0       | 3    | 5     | 5     |
| Sanitização | 0       | 0    | 4     | 6     |

**Checagens:** `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ (326 testes, com Postgres e Redis no ar) · `pnpm --filter @sellbridge/web build` ✅ (nenhum código de servidor no bundle do cliente) · `pnpm audit --prod` ⚠️ 2 vulnerabilidades, ambas só em ferramentas de dev/build: `braces` (alta, via `shadcn`) e `esbuild` (moderada, via `better-auth` → `drizzle-kit`).

Achados vistos por mais de um eixo foram unificados.

## Achados

| #   | Sev.        | Eixo         | Arquivo:linha                                                                                                              | Problema                                                                                                                                                                                                | Cenário de falha                                                                                                                                                                                                       | Correção                                                                                                                |
| --- | ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Alta        | Seg          | `apps/web/src/routes/oauth/mock/autorizar.tsx:28-31,91-96`                                                                 | `redirect_uri` da query passa por `z.url()`, que aceita `javascript:` (confirmado), e vai para `window.location.assign` no "Cancelar". A rota só exige sessão, mesmo sem `MOCK_WEBHOOK_SECRET`          | A vítima logada abre `/oauth/mock/autorizar?state=x&redirect_uri=javascript:…//` e clica em Cancelar. O JS roda na origem e chama qualquer server function. Com `https://evil.com`, vira open redirect                 | Montar a URL de negação a partir de um caminho fixo; `notFound()` no `beforeLoad` quando o mock não estiver configurado |
| 2   | Alta        | Seg          | `apps/web/src/lib/server/auth.ts:111-117`                                                                                  | O papel `admin` é dado no cadastro só por bater com `ADMIN_EMAILS`; não há `requireEmailVerification`                                                                                                   | Um e-mail de admin ainda não cadastrado (deploy novo, troca, typo) é registrado por terceiros, que ganham admin e impersonação de todos os tenants                                                                     | Verificação obrigatória e promoção só quando `emailVerified`; no `create.before`, sempre `user`                         |
| 3   | Alta        | Async        | `packages/marketplaces/src/http.ts:65`, `apps/web/src/lib/server/mailer.ts:14`, `features/listings/mock-sale.server.ts:56` | Nenhum fetch externo tem timeout                                                                                                                                                                        | O ML segura a conexão e o job fica `active` para sempre (o lock é renovado). `token-refresh` e `stock-price-sync` têm `concurrency: 1`: um fetch travado para a renovação de todos os tenants. O shutdown também trava | `AbortSignal.any([AbortSignal.timeout(15_000), init.signal])`                                                           |
| 4   | Alta        | Async        | `apps/web/src/features/webhooks/webhooks.server.ts:54-64`                                                                  | O evento é gravado e depois enfileirado. Se o enqueue falha, a reentrega cai em `duplicate` e responde 200 sem enfileirar                                                                               | O Redis reinicia por 30 s e os pedidos dessa janela nunca são processados                                                                                                                                              | Reenfileirar duplicados ainda não processados (o `jobId` já deduplica)                                                  |
| 5   | Alta        | Async        | `packages/marketplaces/src/http.ts:91-103`, `apps/worker/src/processors/publish-listing.ts:111-135`                        | `POST /items` não é idempotente, mas `fetchWithRetry` repete em 5xx ou erro de rede. Uma falha ao persistir depois do POST também volta o target para `pending`                                         | O ML responde 502 com o item já criado, ou o Postgres oscila depois do POST: anúncio duplicado                                                                                                                         | `retries: 0` em POST/PATCH; falha de persistência pós-publicação → `UnrecoverableError` + log                           |
| 6   | Alta        | Async        | `packages/database/src/repositories/stores.ts:115-124`, `apps/worker/src/processors/token-refresh.ts:42`                   | `updateStoreTokens`/`markStoreStatus` usam só `WHERE id` e forçam `connected`                                                                                                                           | Usuário desconecta durante o refresh e a loja volta conectada; reconexão OAuth sobrescrita pelo refresh antigo; duas instâncias usam o mesmo refresh token → `invalid_grant` → loja expirada                           | Compare-and-swap: `AND status='connected' AND refresh_token_enc = <anterior>` + `returning`                             |
| 7   | Alta        | Perf         | `packages/database/src/schema/orders.ts:49`                                                                                | `order_items` só tem índice em `order_id`                                                                                                                                                               | A ordenação "mais vendidos" em /publicacoes (subquery correlacionada por `listing_target_id`), `selectDailySales` (sem filtro de tenant) e `orderTotals` dos fornecedores fazem seq scan, repetido pelo polling de 2 s | Índices em `listing_target_id` e `supplier_product_id`; `oi.tenant_id` em `selectDailySales`                            |
| 8   | Alta        | Perf         | `packages/database/src/repositories/supplier-reviews.ts:75-88`                                                             | A reputação de fornecedores agrega pedidos de **todos** os tenants (90 dias) a cada carregamento de /fornecedores, sem índice utilizável                                                                | O custo da tela cresce com o volume da plataforma inteira                                                                                                                                                              | Cache por fornecedor (Redis 10–15 min) ou materialized view atualizada pelo worker; índice em `orders(ordered_at)`      |
| 9   | Alta        | Perf/Async   | `packages/database/src/repositories/listings.ts:227-252`, `apps/worker/src/processors/stock-price-sync.ts:56`              | `limit 200` sem `ORDER BY`; um item que falha não atualiza `synced_at`                                                                                                                                  | Mais de 200 alvos que falham sempre monopolizam todas as rodadas e o resto nunca sincroniza. O teto é de cerca de 800 itens/h                                                                                          | `ORDER BY sync_attempted_at NULLS FIRST`; gravar tentativa e erro; paralelizar por loja                                 |
| 10  | Média       | Seg/Perf/San | `features/support/support.server.ts:31,54`, `features/profile/avatar.server.ts:46`                                         | `request.formData()` bufferiza o corpo inteiro antes de checar 5 MB / 2 MB; sem rate limit                                                                                                              | Conta nova (cadastro aberto) manda POST de GBs e derruba a instância por falta de memória                                                                                                                              | Rejeitar por `content-length` antes de `formData()`, limitar o stream, impor limite no proxy e rate limit por usuário   |
| 11  | Média       | Seg/San      | `features/webhooks/webhooks.server.ts:28-52`                                                                               | Endpoint anônimo: `request.text()` sem teto em corpo chunked; eventos inválidos gravados com payload; o ML só é "autenticado" pelo `application_id`, que é público                                      | Flood anônimo enche `webhook_events`. Eventos forjados com `user_id` real consomem a cota de API da vítima (o SSRF está mitigado pela regex `^/?orders/\d+$`)                                                          | Ler o stream com corte em 64 KB; não persistir inválidos; rate limit por IP; dedupe `(user_id, resource)`               |
| 12  | Média       | Seg          | `apps/web/src/lib/server/tenant-session.ts:22-26`                                                                          | `activeOrganizationId` não é revalidado contra a membership; `role` é o papel global                                                                                                                    | Membro removido mantém acesso ao tenant enquanto a sessão for renovada (convites estão expostos em `/api/auth/organization/*`)                                                                                         | Conferir `member(userId, orgId)` com cache curto, ou desligar convites                                                  |
| 13  | Média       | Seg          | (ausente)                                                                                                                  | Nenhum header de segurança: CSP, `frame-ancestors`, HSTS, `Referrer-Policy`                                                                                                                             | Sem CSP o #1 é explorável por completo; clickjacking em "desconectar loja"                                                                                                                                             | Request middleware global com CSP por nonce (script de tema), `frame-ancestors 'none'`, HSTS                            |
| 14  | Média       | Async        | `apps/web/src/features/catalog/catalog.functions.ts:68-81`                                                                 | Publicação em lote faz check-then-act em memória; sem índice único `listings(tenant_id, supplier_product_id)`                                                                                           | Duas abas ou um retry de rede duplicam anúncios e jobs                                                                                                                                                                 | Índice único (que também resolve o #22) + `onConflictDoNothing`                                                         |
| 15  | Média       | Async        | `packages/database/src/repositories/listings.ts:172`                                                                       | Job stalled duas vezes falha sem passar pelo processor; o target fica `publishing` para sempre e a UI continua o polling                                                                                | O worker morre no meio do POST                                                                                                                                                                                         | Tratar `worker.on("failed")` no último attempt ou varredor de `publishing` antigos                                      |
| 16  | Média       | Async        | `apps/worker/src/index.ts:115-128`                                                                                         | Shutdown sem prazo, sem try/catch e sem fechar o pool do Postgres                                                                                                                                       | Rejeição em `close()` vira `unhandledRejection`; com o #3, SIGKILL → #15                                                                                                                                               | `Promise.race` com 25 s + `finally { await database.$client.end() }`                                                    |
| 17  | Média       | Async        | `packages/marketplaces/src/mercado-livre/oauth.ts:76-88`                                                                   | O refresh token do ML é de uso único, mas o `POST /oauth/token` passa pelo retry                                                                                                                        | 5xx depois da rotação → retry com token velho → `invalid_grant` → loja expirada                                                                                                                                        | `retries: 0` no endpoint de token                                                                                       |
| 18  | Média       | San          | `packages/shared/src/schemas/catalog.ts:107-108`                                                                           | `priceForRule` arredonda em float                                                                                                                                                                       | 900 centavos +10% → 990.0000000000001 → **R$ 10,90** em vez de R$ 10,00 (confirmado; 108 combinações erradas na varredura)                                                                                             | Aritmética inteira (abaixo) + casos no teste                                                                            |
| 19  | Média       | San          | `packages/shared/src/runtime/logger.ts:29-30`                                                                              | O logger serializa `error.message` inteiro; `DrizzleQueryError` inclui `params`                                                                                                                         | Falha em `createTicket`/`upsertMarketplaceOrder` grava texto do chamado e nome do comprador nos logs                                                                                                                   | Para `DrizzleQueryError`, logar só `name`, `cause.code` e a query sem params                                            |
| 20  | Média       | Perf         | `apps/web/src/features/listings/listings.queries.ts:11`                                                                    | Polling de 2 s sem backoff sobre `listListingOverview` (cerca de 7 queries)                                                                                                                             | Target em backoff ou worker parado: a aba martela o banco por tempo indefinido                                                                                                                                         | Backoff 2→5→15→30 s com teto; endpoint leve só de status                                                                |
| 21  | Média       | Perf         | `apps/web/src/lib/server/auth.ts:140`, `routes/_app/route.tsx:11`                                                          | Sem `cookieCache`: cada server function busca a sessão no Postgres; `beforeLoad` encadeia `getAppSession` → `getTenantRegion` sem cache                                                                 | Navegação e preload por intent esperam RPCs em série                                                                                                                                                                   | `session.cookieCache` curto; `ensureQueryData` com `staleTime` no `beforeLoad`                                          |
| 22  | Média       | Perf         | `apps/web/src/features/reports/reports.functions.ts:62-74`, `packages/database/src/client.ts:8`                            | O dashboard dispara cerca de 11 queries paralelas com pool `max: 10`; `orderFinanceCte` é recalculado 6–7×                                                                                              | Uma visita ocupa o pool inteiro; dois usuários já entram em fila                                                                                                                                                       | Consolidar queries (`grouping sets`/CTE materializado); pool configurável por env                                       |
| 23  | Média       | Perf         | `packages/database/src/repositories/sql/search-pattern.ts:21-36`                                                           | `translate(lower()) like '%x%'` sem `pg_trgm`, numa tabela global; count e página em série                                                                                                              | Seq scan duplo a cada busca no catálogo e na paleta                                                                                                                                                                    | Índice GIN trigram de expressão (ou coluna `search_text`); `Promise.all`; pular o count na paleta                       |
| 24  | Média       | Perf         | `packages/database/src/repositories/suppliers.ts:343`, `schema/listings.ts:26`                                             | `EXISTS` de "já publicado" sem índice `(tenant_id, supplier_product_id)`                                                                                                                                | Filtro "não publicados" custa produtos × publicações                                                                                                                                                                   | Índice único (o mesmo do #14)                                                                                           |
| 25  | Média/Baixa | San          | `apps/web/src/lib/server/auth.ts:47-73`                                                                                    | `/sign-up/email` não valida `name` no servidor                                                                                                                                                          | Nome de centenas de KB vira nome e slug da organização                                                                                                                                                                 | Validar com `signUpSchema` no `guardAccountRoutes`                                                                      |
| 26  | Baixa       | Seg          | TanStack Start `ShallowErrorPlugin` + `lib/errors.ts`                                                                      | A mensagem crua de erros inesperados chega ao cliente                                                                                                                                                   | Usuário vê `Failed query: <SQL> params: …`                                                                                                                                                                             | Middleware global que troca não-`AppError` por mensagem genérica                                                        |
| 27  | Baixa       | Seg          | `environment.ts:17`                                                                                                        | O placeholder de `.env.example` passa no `min(32)`; o mock pode ficar ligado em produção                                                                                                                | Deploy com segredo de exemplo                                                                                                                                                                                          | Em produção, recusar valores de exemplo e `MOCK_WEBHOOK_SECRET`                                                         |
| 28  | Baixa       | Seg          | Better Auth (padrão)                                                                                                       | Rate limit em memória por instância, com IP vindo de `x-forwarded-for`                                                                                                                                  | Força bruta distribuída entre instâncias ou com header forjado                                                                                                                                                         | `rateLimit.storage: "secondary-storage"` (Redis) + `ipAddressHeaders` do proxy                                          |
| 29  | Baixa       | Seg          | `schema/stores.ts:29`, `repositories/webhooks.ts:194`                                                                      | A mesma loja do ML pode ser conectada em dois tenants; o webhook escolhe um sem ordem definida                                                                                                          | Pedidos caem no tenant errado (exige credenciais do ML)                                                                                                                                                                | Unicidade global de `(marketplace, external_shop_id)` para lojas conectadas                                             |
| 30  | Baixa       | San          | `mailer.ts:24-26`                                                                                                          | Falha do Resend vira 500 só para e-mails existentes no reset de senha                                                                                                                                   | Enumeração de contas                                                                                                                                                                                                   | Capturar e logar dentro de `sendResetPasswordEmail`                                                                     |
| 31  | Baixa       | San          | `routes/_app/lojas.tsx:22-23,47-50`                                                                                        | `erro`/`conectada` livres da URL viram toast oficial                                                                                                                                                    | Phishing via link `?erro=pague via PIX…`                                                                                                                                                                               | Trafegar código de erro mapeado para enum                                                                               |
| 32  | Baixa       | San          | `shared/schemas/stores.ts:61-62`, `catalog.ts:88-91`                                                                       | `priceCents` sem `max` (estoura int4); arrays/records sem `max` (passam do limite de 65535 parâmetros)                                                                                                  | 500 em vez de 400                                                                                                                                                                                                      | `.max(999_999_999)`, `.max(20)`, `.max(MAX_BULK_PUBLISH)`                                                               |
| 33  | Baixa       | San          | `mercado-livre/schemas.ts:23,29`                                                                                           | `date_created: z.string()` e `permalink: z.string()`                                                                                                                                                    | Data inválida → 5 retries à toa (o `javascript:` em href já é bloqueado pelo React 19)                                                                                                                                 | `z.iso.datetime({ offset: true })`, `z.url({ protocol: /^https$/ })`                                                    |
| 34  | Baixa       | Async        | `processors/webhook-event.ts:155-158`                                                                                      | `isFinal` é calculado e não usado; erro não retentável é tentado 5×                                                                                                                                     | 404/400 do ML repetido à toa                                                                                                                                                                                           | `UnrecoverableError` quando `!isRetryableError`                                                                         |
| 35  | Baixa       | Async        | `features/listings/use-listing-actions.ts:79-117`                                                                          | `invalidateQueries` só no `onSuccess`                                                                                                                                                                   | Duas mutações otimistas: o rollback da primeira apaga o patch da segunda                                                                                                                                               | `refresh()` no `onSettled`                                                                                              |
| 36  | Baixa       | Async        | `worker/src/index.ts:27`, `http.ts:102`                                                                                    | Rate limiter de 5/s fixo, sem divisão por instância; `Retry-After` não alimenta o bucket                                                                                                                | Outros jobs da loja continuam batendo durante o 429                                                                                                                                                                    | Cota por env ÷ instâncias; pausar o bucket da loja no 429                                                               |
| 37  | Baixa       | Perf         | vários                                                                                                                     | Índices futuros: `listing_targets(tenant_id,status,updated_at)`, `listing_targets(store_connection_id,external_id)`, `store_connections(marketplace,external_shop_id)`, `tickets(tenant_id,updated_at)` | —                                                                                                                                                                                                                      | Criar conforme o volume                                                                                                 |
| 38  | Baixa       | Perf         | `reports.ts:474`                                                                                                           | O CSV é truncado em 20.000 linhas sem avisar                                                                                                                                                            | Exportação incompleta                                                                                                                                                                                                  | Header ou aviso de truncamento                                                                                          |
| 39  | Baixa       | Perf         | `cash-flow-chart.tsx:953-970`, `suppliers.ts` (`listRegionCatalog`)                                                        | `data` do gráfico sem `useMemo`; o catálogo devolve `description` e `imageUrls` não usados                                                                                                              | Re-render completo do Recharts; payload SSR inflado                                                                                                                                                                    | Memoizar; selecionar só as colunas usadas                                                                               |

Outros pontos baixos sem item próprio: /pedidos agrega todo o histórico a cada página (`supplier-reviews.ts:288-330`); `orders.ts:130-141` faz `findFirst`+insert, já mitigado pelo índice único e pelo retry; `disconnectStore` não revoga o token no ML; dobra de acentos assimétrica entre `foldAccents` e `translate`; o chunk `dashboard` tem 447 KB (125 KB gzip, Recharts).

## Correções para os achados Altos

**#1, OAuth simulado**

```ts
function denyAuthorization(search: ConsentSearch) {
  const url = new URL("/api/oauth/mock/callback", window.location.origin);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set("state", search.state);
  window.location.assign(url.toString());
}
// beforeLoad: chamar uma server fn que lança notFound() se !connectors.mock.isConfigured()
```

**#2, admin só com e-mail verificado**

```ts
emailAndPassword: { enabled: true, requireEmailVerification: true, /* … */ },
emailVerification: { sendVerificationEmail, sendOnSignUp: true },
databaseHooks: {
  user: {
    create: { before: async (user) => ({ data: { ...user, role: "user" } }) },
    update: {
      after: async (user) => {
        if (!user.emailVerified || user.role === "admin") {
          return;
        }
        if (!environment.ADMIN_EMAILS.includes(user.email.toLowerCase())) {
          return;
        }
        await promoteToAdmin(user.id);
      },
    },
  },
},
```

**#3, timeout**

```ts
return await attempt.fetchImplementation(attempt.url, {
  ...attempt.init,
  signal: AbortSignal.any([
    AbortSignal.timeout(15_000),
    ...(attempt.init.signal ? [attempt.init.signal] : []),
  ]),
});
```

**#4, webhook reenfileirado**

```ts
if (recorded.status === "duplicate" && recorded.processed) {
  return reply(200, { status: "duplicado" });
}
await enqueueWebhookEvent(recorded.id); // jobId = id do evento → idempotente
```

**#5, publicação sem duplicar**

```ts
// client.ts: não repetir métodos não idempotentes
const retry =
  method !== "GET" && request.retryUnsafe !== true ? { ...config.retry, retries: 0 } : config.retry;

// publish-listing.ts
const result = await connector.publishProduct(/* … */);
try {
  await markTargetPublished(/* … */);
  await markTargetSynced(/* … */);
} catch (error) {
  logger.error("listing.persist_after_publish_failed", {
    listingTargetId,
    externalId: result.externalId,
    error,
  });
  throw new UnrecoverableError("Publicado no marketplace, mas não persistido");
}
```

**#6, tokens com compare-and-swap**

```ts
const updated = await database
  .update(storeConnections)
  .set({ ...tokens, lastError: null })
  .where(
    and(
      eq(storeConnections.id, id),
      eq(storeConnections.status, "connected"),
      eq(storeConnections.refreshTokenEnc, previousRefreshTokenEnc),
    ),
  )
  .returning({ id: storeConnections.id });
if (updated.length === 0) {
  logger.info("store.token_refresh_discarded", { storeConnectionId: id });
}
```

**#7–#9, índices e ordem do sync**

```ts
// schema/orders.ts
index("order_items_listing_target_idx").on(table.listingTargetId),
index("order_items_supplier_product_idx").on(table.supplierProductId),
// schema/listings.ts (resolve também #14 e #24)
uniqueIndex("listings_tenant_product_uidx").on(table.tenantId, table.supplierProductId),
// listings.ts, findTargetsNeedingSync
.orderBy(sql`${listingTargets.syncAttemptedAt} asc nulls first`)
```

**#18, preço em inteiros** (Média, mas afeta o valor cobrado)

```ts
const numerator = product.costCents * (100 + rule.percent) + 1_000;
const endingInNinety = Math.ceil(numerator / 10_000) * 100 - 10;
return Math.max(endingInNinety, product.costCents + 100);
```

## O que está bem feito

- **Isolamento de tenant:** todo repositório filtra por `tenantId` do contexto (`getAttachment`, `addTicketMessage` com `FOR UPDATE`, `getTargetForPublishing`, `setListingsPaused`, relatórios); todas as server functions usam middleware, exceto duas que só leem a sessão.
- **OAuth:** `state` de 24 bytes, uso único via `DELETE … RETURNING`, TTL de 10 min, vinculado a tenant e marketplace; PKCE S256; `redirect_uri` fixo.
- **Tokens:** AES-256-GCM, IV aleatório de 12 bytes, tag verificada, chave validada no boot, prefixo de versão; nunca expostos ao cliente.
- **Webhook do ML:** o payload só serve de gatilho, o pedido é re-buscado com regex anti-SSRF; o HMAC do mock usa `timingSafeEqual` sobre o corpo cru.
- **CSV:** neutraliza `= + - @ \t \r`, escapa e usa centavos inteiros.
- **Uploads:** magic bytes, sem SVG, nome gerado no servidor, `nosniff` + `attachment`, storage protegido contra traversal.
- **Worker:** jobs validados com Zod, `UnrecoverableError` no publish, `jobId` determinístico, `attempts`/`backoff` padrão nas filas.
- **Performance:** `listListingOverview` sem N+1, agregação em SQL, período com teto de 366 dias, code-splitting por rota, nenhum vazamento de servidor no bundle, `pageSize` limitado a 48.
- **Better Auth:** rotas sensíveis bloqueadas durante a impersonação, sessões revogadas no reset de senha.

## Top 5 ações

1. **Fechar o XSS do OAuth simulado e esconder a rota em produção** (#1, #27) — P
2. **Admin só com e-mail verificado** (#2, #25) — P/M
3. **Timeout HTTP e sem retry em POST/refresh de token** (#3, #5, #17) — P
4. **Escritas condicionais no worker:** CAS de tokens, reenfileirar webhook, índice único em `listings` (#4, #6, #14) — M
5. **Índices e ordem do sync:** `order_items`, `listings(tenant, product)`, `ORDER BY` no sync, `pg_trgm` (#7, #9, #23, #24) — M

Logo em seguida: limite de corpo nos uploads e no webhook (#10, #11), headers de segurança (#13) e preço em inteiros (#18).

## Lacunas de teste

- **vitest (shared):** `priceForRule` com (900, 10) e (1000, 39).
- **vitest (database):** `updateStoreTokens` não sobrescreve loja desconectada; `recordWebhookEvent` duplicado não processado é reenfileirado; índice único bloqueia anúncio duplicado.
- **vitest (worker):** publicação com falha de persistência não republica; `fetchWithRetry` não repete POST; timeout aborta o fetch; `webhook-event` com 404 não é retentado.
- **vitest (marketplaces):** refresh de token sem retry.
- **Playwright:** `/oauth/mock/autorizar` com `redirect_uri=javascript:` não executa e retorna 404 sem mock; membro removido perde acesso; upload acima do limite é rejeitado sem estourar memória; cadastro com e-mail de admin não ganha papel admin antes da verificação.
