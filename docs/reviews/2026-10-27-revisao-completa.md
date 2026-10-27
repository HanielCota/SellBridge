# Revisão completa — sanitização, async, performance e segurança

Data: 2026-10-27 · Modo: `auditoria` + correção dos Altos · Base: `origin/main` em `e8e2f165` (PR #126) · Branch: `fix/audit-2026-10-27` · Prompt: [docs/prompts/revisao-completa.md](../prompts/revisao-completa.md) (v2) · Anterior: [2026-10-11](2026-10-11-revisao-completa.md)

## Resumo executivo

Nenhum achado Crítico. O isolamento entre tenants se mantém em todas as superfícies (API v1, rotas `api/**`, 225 server functions, worker e repositórios), inclusive nas áreas novas: painel do fornecedor, suporte, admin, fulfillment e rastreio. Foram encontrados dois Altos, ambos corrigidos nesta rodada com teste de regressão:

1. **Pedido forjado por webhook** (A1): uma notificação do ML sem assinatura podia gravar como venda do revendedor um pedido de outro vendedor, que o token da loja lê como comprador.
2. **Anúncio duplicado no ML** (A2): depois da varredura de publicações travadas e de um reprocessamento, a execução antiga ainda podia criar o anúncio ao lado da nova.

Dos achados abertos de 2026-10-11, a maior parte foi corrigida. Os que seguem abertos são Médios ou Baixos (lista na Regressão).

**Placar dos achados novos** (achados reavaliados contam como novos)

| Eixo        | Crítica | Alta | Média | Baixa |
| ----------- | ------- | ---- | ----- | ----- |
| Segurança   | 0       | 1    | 3     | 7     |
| Async       | 0       | 1    | 0     | 5     |
| Performance | 0       | 0    | 0     | 3     |
| Sanitização | 0       | 0    | 0     | 4     |

## Checagens

Rodadas na branch, já com as duas correções.

| Comando                               | Resultado                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                      | ✅                                                                                                                                                                                      |
| `pnpm lint`                           | ✅                                                                                                                                                                                      |
| `pnpm check:no-else`                  | ✅ (1.537 arquivos)                                                                                                                                                                     |
| `pnpm format:check`                   | ✅                                                                                                                                                                                      |
| `pnpm test`                           | ✅ shared 1.132, marketplaces 209, database 583, web 1.184, worker 105, raiz 7. Rodado num banco descartável migrado até a 0055, porque o banco local de desenvolvimento estava na 0048 |
| `pnpm --filter @sellbridge/web build` | ✅                                                                                                                                                                                      |
| `pnpm test:e2e`                       | Não rodado nesta rodada: as correções não tocam tela nem rota, e cada uma tem teste de regressão no nível do repositório ou do conector                                                 |
| `pnpm audit --prod`                   | 1 moderada: `esbuild <=0.24.2` via `better-auth > drizzle-kit > @esbuild-kit/core-utils` (afeta só o servidor de desenvolvimento do esbuild). Nenhuma alta ou crítica                   |

## Regressão (achados abertos ou parciais em 2026-10-11)

Os itens que 2026-10-11 já dava como corrigidos (N1–N3, #1–#4, #6–#9, #17, N14, N16) não foram reabertos.

| #              | Sev. anterior | Status                    | Evidência                                                                                                                                  |
| -------------- | ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| #10 / #11 / N5 | Média         | Corrigido                 | `shared/runtime/http-body.ts` (`readBodyWithin`, `readFormDataWithin`) em todas as rotas cruas; `limitRequestBody` em `apps/web/server.ts` |
| #12            | Média         | Corrigido                 | `tenant-session.ts` resolve o perfil por `listMemberships` a cada request                                                                  |
| #13            | Média         | Parcial                   | `start.ts`: XFO, `frame-ancestors`, nosniff, Referrer-Policy, HSTS. Falta `script-src`/`object-src`/`base-uri`                             |
| #14            | Média         | Corrigido (outro desenho) | `assertNotListedYet` trava as lojas com `FOR UPDATE` (`listings.ts:62-87`)                                                                 |
| #16            | Média         | Parcial                   | Shutdown limitado a 25 s com `allSettled`; falta handler de `unhandledRejection`/`uncaughtException` no worker                             |
| #19            | Média         | Corrigido                 | `logger.ts` redige chaves sensíveis e remove `params` de "Failed query"                                                                    |
| #20            | Média         | Corrigido                 | polling de anúncios só com `hasActive`; sweepers encerram pending/publishing                                                               |
| #21            | Média         | Aberto                    | sem `cookieCache` em `lib/server/auth.ts`                                                                                                  |
| #22            | Média         | Aberto                    | pool `max` 10 fixo em `database/client.ts`                                                                                                 |
| #23 / #24      | Média / Baixa | Corrigido                 | `0023_pending_indexes.sql` (trigram + `listings_tenant_product_idx`)                                                                       |
| #25 / N24      | Baixa         | Parcial                   | nome validado no cadastro; `image` livre em `/sign-up/email` (vira pixel de rastreio nas telas do suporte)                                 |
| #26 / N25      | Baixa         | Aberto                    | `getAppSession`/`getSignInOptions` sem `userFacingErrors`                                                                                  |
| #27 / N12      | Média         | Parcial                   | segredo placeholder recusado em produção; falta falhar fechado sem `NODE_ENV`                                                              |
| #28 / N11      | Média         | Parcial                   | `CLIENT_IP_HEADER` corrige o XFF; rate limit do Better Auth segue em memória e sem regra para reset de senha                               |
| #29, #31–#34   | Baixa         | Corrigido                 | índice único parcial de lojas; códigos de toast por enum; `max` nos lotes; `permalink` validado; `UnrecoverableError` na publicação        |
| #30            | Baixa         | Aberto                    | `sendResetPasswordEmail` sem try/catch: 500 só para contas existentes (enumeração)                                                         |
| #35            | Baixa         | Parcial                   | rollback existe em `use-listing-actions.ts`; falta `onSettled` invalidando                                                                 |
| #36            | Baixa         | Aberto                    | bucket fixo de 5/s; `Retry-After` não alimenta o bucket                                                                                    |
| #37            | Baixa         | Parcial                   | faltam `tickets(tenant_id, updated_at)` e `listing_targets(tenant, status, updated_at)`                                                    |
| #38            | Baixa         | Corrigido                 | exportação acima de 20.000 linhas devolve 422 com motivo                                                                                   |
| #39            | Baixa         | Aberto                    | `cash-flow-chart.tsx` sem `useMemo` (impacto baixo)                                                                                        |
| N4, N8, N13    | Média         | Corrigido                 | `response.destroy()`; índices e prune em lote; `/organization/*` fechado ao navegador                                                      |
| N6             | Média         | Aberto                    | ver M1 abaixo                                                                                                                              |
| N7             | Média         | Parcial                   | drena enquanto o lote enche; sem justiça por tenant                                                                                        |
| N9             | Média         | Aberto                    | ver M2 abaixo                                                                                                                              |
| N10            | Média         | Corrigido                 | `withDeadline` de 5 s no DNS (`webhook-url-guard.ts`)                                                                                      |
| N15            | Média         | Corrigido (outro desenho) | status de pedido monotônico sob trava (`orders.ts:211-251`)                                                                                |
| N17–N20        | Baixa         | Aberto                    | sem status `paused`; `DELETE` a cada request no rate limit; 1+N no `GET /webhook-endpoints`; `nextAfter` repete `after`                    |
| N21            | Baixa         | Corrigido                 | `clock_timestamp()` + `lock_timeout 3s` (`api-events.ts:33-50`)                                                                            |
| N22            | Baixa         | Aberto                    | ver B3 abaixo                                                                                                                              |
| N23            | Baixa         | Parcial                   | bloqueado durante impersonação; sem checagem de papel owner/admin                                                                          |
| N26–N28, N30   | Baixa         | Corrigido                 | schemas com `.catch`; `max` de preço; anexos apagados na falha; `field-motion.ts` removido                                                 |
| N29            | Baixa         | Aberto                    | sem flag `needs_sync`                                                                                                                      |
| N31            | Baixa         | Aberto                    | ver B9 abaixo                                                                                                                              |
| 10-25          | —             | Aberto                    | `support.author_id` com `onDelete: cascade`; comentário da nota apagado ao reabrir (`repositories/support.ts:271`)                         |

## Mapa de bordas (resumido)

- **API v1** (16 operações): auth por chave → escopo → rate limit → corpo com teto em stream → Zod → idempotência → handler → presenter por allowlist. Docs e OpenAPI públicos por decisão.
- **Rotas `api/**`** (19): todas as `POST` com cookie chamam `assertSameOrigin`; uploads com teto em stream e magic bytes; webhook do ML anônimo (só `application_id`); Stripe com assinatura sobre o corpo cru; diagnóstico com limite por IP.
- **Server functions** (225 em 43 arquivos): todas com middleware, exceto `getAppSession`, `getSignInOptions` (só leitura da própria sessão ou constante), `rememberSignUpProfileFn` e as duas funções do link do fornecedor (autenticadas por token, por desenho). `tenantId` sempre do contexto.
- **Worker** (12 processors): `publish-listing` (5 tentativas, `UnrecoverableError` depois do POST), `webhook-events` (jobId = id do evento, 8 tentativas + varredura de 24 h), `order-auto-forward`, `stock-price-sync`, `token-refresh` (sem retry), `shipment-tracking`, `webhook-delivery` e `notification-delivery` (lease no banco), `order-message-follow-up`, varreduras.

## Achados novos

| #   | Severidade | Eixo        | Arquivo:linha                                                                             | Problema                                                                                       | Cenário de falha                                                                                                                                                                                              | Correção                                                                                                               | Teste                                                                                  |
| --- | ---------- | ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A1  | Alta       | Segurança   | `packages/marketplaces/src/mercado-livre/orders.ts` (`fetchOrder`)                        | O pedido re-buscado não era conferido contra o vendedor da loja                                | Um vendedor do ML que vendeu à conta do revendedor posta a notificação (sem assinatura, `application_id` é público) com `user_id` do revendedor; a venda falsa entra em receita, relatórios e `order.created` | **Corrigido** em `d3aadd1b`: `seller.id` precisa bater com `externalShopId`; erro final, o evento é marcado processado | `mercado-livre-connector.test.ts` › "refuses an order sold by another seller as final" |
| A2  | Alta       | Async       | `packages/database/src/repositories/listings.ts` (`setTargetCreationStarted`)             | A marcação "criação iniciada" não conferia de quem era a reivindicação                         | Com o ML lento, a varredura encerra a execução A como erro aos 15 min; o revendedor reprocessa; B reivindica; A ainda marca a criação e as duas fazem `POST /items` (anúncio duplicado)                       | **Corrigido** em `ffb2a11f`: a reivindicação leva `attempts` (só cresce) e a marcação exige o mesmo valor              | `listings.test.ts` › "lets only the current claim start the marketplace creation"      |
| M1  | Média      | Segurança   | `features/public-api/endpoints/webhooks.server.ts:42-70`                                  | (N6) chave só com `webhooks:manage` assina todos os eventos                                    | Parceiro com chave "só para webhooks" passa a receber `order.created` com valores sem ter `orders:read`                                                                                                       | Levar os escopos ao `ApiHandlerContext` e mapear tipo de evento → escopo                                               | 403 para `eventTypes: []` sem `orders:read`                                            |
| M2  | Média      | Segurança   | `features/public-api/docs.server.ts:6,53-63`                                              | (N9) script do Scalar via jsDelivr sem SRI e sem CSP, na origem do cookie de sessão            | CDN comprometida roda como o usuário logado em `/api/v1/docs` e cria uma chave `sb_live_` com todos os escopos                                                                                                | SRI + `crossorigin`, ou servir o bundle; CSP própria na resposta                                                       | HTML contém `integrity=` e a resposta tem `script-src`                                 |
| M3  | Média      | Segurança   | `apps/web/src/features/webhooks/webhooks.server.ts:32-63`                                 | Webhook anônimo sem limite por IP e sem checar se `user_id` é loja conectada                   | 100 req/s com `_id` novo e `user_id` real: cada post vira linha + job + GET no ML com o token da vítima; a fila de pedidos reais de todos os tenants atrasa                                                   | Limite por IP/global com 429; ignorar `user_id` desconhecido antes de gravar                                           | Evento de loja desconhecida responde 200 sem linha nem job                             |
| B1  | Baixa      | Async       | `apps/worker/src/processors/token-refresh.ts:43-58`                                       | Falha ao gravar os tokens rotacionados descarta o refresh de uso único                         | Queda curta do banco depois do refresh: a próxima rodada usa o token gasto e a loja expira                                                                                                                    | Repetir a gravação CAS com backoff                                                                                     | Stub falha uma vez; tokens salvos                                                      |
| B2  | Baixa      | Async       | `apps/worker/src/processors/order-message-follow-up.ts:48`                                | `messageKey` usa `now()` do processamento                                                      | Job reentregue gera outra `dedupeKey`: aviso ou e-mail em dobro                                                                                                                                               | Derivar a chave do jobId ou do fim da janela                                                                           | Processar duas vezes: um aviso                                                         |
| B3  | Baixa      | Async       | `run-endpoint.server.ts:146-176`; `api-idempotency.ts:33-83`                              | (N22) sem try/catch no topo; `complete` não confere o dono do claim                            | `finish` falha depois de criar o endpoint; após 5 min o retry com a mesma chave cria um segundo endpoint                                                                                                      | try/catch → problem+json; coluna `claim_id` no `WHERE`                                                                 | `complete` mockado lançando                                                            |
| B4  | Baixa      | Segurança   | `packages/database/src/schema/public-api.ts:63-79`                                        | Idempotency-Key por organização, não por chave de API                                          | Duas integrações da mesma conta com chaves determinísticas recebem o replay uma da outra (inclui `whsec_`)                                                                                                    | `api_key_id` na PK                                                                                                     | Mesma chave em duas chaves de API reserva duas vezes                                   |
| B5  | Baixa      | Segurança   | `apps/web/src/features/stores/oauth.server.ts:110-158`                                    | `GET /api/oauth/:mp/start` disparável de outro site, com `?fornecedor=` livre                  | Loja "pendente" reconectada por link do atacante recebe o fornecedor dele                                                                                                                                     | Exigir `Sec-Fetch-Site` same-origin/none ou trocar por POST                                                            | Start cross-site redireciona sem criar `state`                                         |
| B6  | Baixa      | Segurança   | `apps/web/src/lib/server/impersonation-rules.ts:11-41`                                    | `saveSupplierReviewFn` fora da lista de bloqueio; CSV financeiro baixável durante a visita     | Atendente avalia fornecedores em nome do revendedor                                                                                                                                                           | Bloquear a função e a exportação com `impersonatedBy`                                                                  | Estender o teste de cobertura de nomes                                                 |
| B7  | Baixa      | Async       | `packages/marketplaces/src/mercado-livre/listings.ts:236`                                 | POST de atributos condicionais (só leitura) nunca é repetido                                   | Um 503 do ML vira erro final antes da criação                                                                                                                                                                 | Marcar esse POST como seguro para retry                                                                                | 503 e depois 200: publica                                                              |
| B8  | Baixa      | Sanitização | `packages/shared/src/domain/catalog-spreadsheet.ts:120-168`                               | `parseDecimal` lê "1.234" como 1,234                                                           | Planilha com custo em texto grava R$ 1,23 e estoque 1                                                                                                                                                         | Aceitar só os formatos de `parseBrlToCents`; senão, erro na linha                                                      | "1.234" vira 1234,00 ou erro                                                           |
| B9  | Baixa      | Segurança   | `apps/worker/src/environment.ts:39`, `.env.example:64`                                    | (N31) `WEBHOOK_ALLOW_PRIVATE_URLS=true` aceito em produção; o exemplo vem `true`               | `.env.example` copiado para produção desliga a proteção de SSRF                                                                                                                                               | `superRefine` recusando em produção; exemplo `false`                                                                   | Ambiente de produção com a flag falha no boot                                          |
| B10 | Baixa      | Async       | `packages/database/src/repositories/stock-reservations.ts:177-214`                        | Reserva trava produtos fora da ordem por id                                                    | Reposição [A,B] concorrente com pedido [A,B]: deadlock, uma transação abortada                                                                                                                                | Travar por id antes do laço                                                                                            | Duas transações concorrentes sem 40P01                                                 |
| B11 | Baixa      | Sanitização | `packages/database/src/repositories/account-export.ts:123-166`                            | Mensagem de fornecedor exportada como "Equipe SellBridge"                                      | Exportação de dados pessoais atribui ao time uma resposta do fornecedor                                                                                                                                       | Rotular por `tickets.audience`                                                                                         | Exportação com conversa de fornecedor                                                  |
| B12 | Baixa      | Sanitização | `packages/shared/src/schemas/support.ts:202,235`; `schemas/admin.ts:68`                   | IDs sem `.max()`                                                                               | Sem exploração (teto de 5 MB por server function)                                                                                                                                                             | `.max(64)`                                                                                                             | —                                                                                      |
| B13 | Baixa      | Performance | `endpoints/events.server.ts:131-134`; `webhooks.server.ts:167-180`; `api-keys.ts:121-138` | (N18–N20) `nextAfter` repete `after`; 1+N no `GET /webhook-endpoints`; `DELETE` a cada request | Varredura repetida de 30 dias; 11 queries com pool 10; 240 escritas/min por chave                                                                                                                             | Ver 2026-10-11                                                                                                         | —                                                                                      |
| B14 | Baixa      | Segurança   | `features/public-api/webhook-rules.server.ts:284-294`                                     | `localhost.` (ponto final) passa na checagem da web                                            | Sem SSRF (o worker confere na conexão); só a mensagem amigável se perde                                                                                                                                       | Remover o ponto final antes de checar                                                                                  | `https://localhost./x` recusado                                                        |

### Código das correções (Altos)

```ts
// packages/marketplaces/src/mercado-livre/orders.ts
const raw = await requestJson(context, {
  schema: sellerOrderSchema,
  path: `/orders/${match[1]}`,
  init,
});
if (String(raw.seller.id) !== store.externalShopId) {
  throw marketplaceError("Pedido não pertence à loja conectada", { retryable: false });
}
```

```ts
// packages/database/src/repositories/listings.ts
.where(
  and(
    eq(listingTargets.id, claim.listingTargetId),
    eq(listingTargets.attempts, claim.attempts),
    eq(listingTargets.status, "publishing"),
    started ? eq(listingTargets.pauseRequested, false) : undefined,
  ),
)
```

O A2 fecha a duplicação no ponto que importa (o `POST /items`). Uma falha tardia da execução antiga ainda pode devolver a nova execução para `pending`; nesse caso a nova perde a marcação de criação e recua com conflito, sem anúncio duplicado.

## O que está bem feito

- **Pipeline da API v1** (`request-steps.server.ts`, `run-endpoint.server.ts`): auth → escopo → rate limit → corpo → Zod → idempotência, nessa ordem; contador e claim atômicos; resposta guardada cifrada.
- **Isolamento** em todos os repositórios alcançados, com defesa em profundidade em `getTargetForPublishing` e no painel do fornecedor (`supplierPanelMiddleware` + filtro por `supplierId` em toda escrita).
- **SSRF de saída**: `publicOnlyLookup` na conexão (contra DNS rebinding), sem redirect, faixas NAT64/6to4/SIIT/Teredo (`network-address.ts`, `webhook-http.ts`).
- **Ingestão de pedidos** (`orders.ts`): `FOR UPDATE`, `ON CONFLICT` + releitura travada, status monotônico, outbox na mesma transação.
- **OAuth** (`oauth.server.ts`): `state` de uso único apagado antes de ser checado, PKCE, host de redirect fixo.
- **Bordas do cliente**: `internalPathSchema` contra open redirect (com e2e), `validateSearch` em todas as rotas com search params, `dangerouslySetInnerHTML` só com constantes.

## Top 5 ações

1. **M3 + B9**: limitar o webhook anônimo e recusar `WEBHOOK_ALLOW_PRIVATE_URLS` em produção (P).
2. **M2 + #13**: SRI/CSP na página de docs e `object-src 'none'; base-uri 'self'` global (P).
3. **M1**: escopos de leitura exigidos por tipo de evento nos webhooks da API (M).
4. **B3 + B4**: claim de idempotência com dono e por chave de API, com migration (M).
5. **#30 + #25/N24 + B6**: reset de senha sem enumeração, `image` recusada no cadastro, regras de impersonação completas (P).

## Lacunas de teste

- Worker: processar um evento de pedido de outro vendedor de ponta a ponta (o teste novo cobre o conector).
- Vitest de rota para o webhook anônimo com `user_id` desconhecido e rajada.
- Teste de propriedade na API v1: toda operação não-GET exige escopo `:write`/`:manage` e a resposta passa no `response` estrito.
- Concorrência real (duas transações) para `reserveShortItems`.

## Atualizações deste prompt

- O worker agora tem 12 processors (inclui `order-auto-forward`, `shipment-tracking`, `notification-delivery`, `order-message-follow-up`, `ticket-auto-close`); o contexto lista só 5.
- Áreas novas que merecem linha própria no contexto: painel do fornecedor (`supplierPanelMiddleware`, link por token em `supplier-link-token.ts`), suporte com conversas de fornecedor e impersonação (`impersonation-rules.ts`), fulfillment/rastreio, faturamento Stripe (`billing/webhook.server.ts`) e exportação de conta.
- A referência de regressão passa a ser este relatório.
