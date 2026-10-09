# Plano do MVP

## Estrutura de pastas

```
apps/
  web/                 TanStack Start
    src/routes/        _auth/ (login, cadastro), _app/ (dashboard, fornecedores,
                       lojas, publicacoes, financeiro, suporte), admin/, api/ (auth, oauth, webhooks)
    src/features/<modulo>/  server functions, queries e componentes por módulo
    src/components/ui/ shadcn
    src/lib/           auth, env, query client, errors
  worker/
    src/queues/        publish, sync-stock-price, webhook-events, token-refresh
    src/processors/
packages/
  db/            schema/ (um arquivo por domínio), migrations/, seed/, repositórios escopados por tenant
  marketplaces/  MarketplaceConnector (interface), mock/, mercado-livre/, shopee/, tiktok-shop/,
                 http (retry + backoff, rate limit), criptografia de tokens
  shared/        schemas Zod, money (centavos), cep, erros tipados, helpers de env
  config/        tsconfig base (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
scripts/check-no-else.ts
docs/decisions.md
docker-compose.yml · .oxlintrc.json · turbo.json · .github/workflows/ci.yml
```

## Modelo de dados

- **Auth (Better Auth):** user, session, account, verification + plugin organization (organization, member). O tenant é a organization; cada usuário recebe uma no cadastro.
- **Região:** `cep_cache` (cep, uf, cidade, bairro, payload, fetched_at); `tenant_profile` (tenant_id, cep, uf, cidade).
- **Fornecedores** (globais, gerenciados pelo admin): `suppliers` (nome, nicho, uf, cidade), `supplier_coverage` (supplier_id, uf, cidade opcional), `categories`, `supplier_products` (sku, título, cost_cents, estoque, categoria, imagens).
- **Lojas:** `store_connections` (tenant_id, marketplace, external_shop_id, access_token_enc, refresh_token_enc, expires_at, status: connected | expired | error | disconnected).
- **Publicação:** `listings` (tenant_id, supplier_product_id, título, descrição, price_cents); `listing_targets` (listing_id, store_connection_id, status: pending | publishing | published | error, external_id, error_reason, attempts, idempotency_key).
- **Vendas:** `orders` (tenant_id, store_connection_id, external_order_id único por loja, status, total_cents, marketplace_fee_cents, ordered_at); `order_items` (listing_target_id, qty, unit_price_cents, unit_cost_cents); `order_adjustments` (refund | return | commission, amount_cents).
- **Webhooks:** `webhook_events` (marketplace, external_event_id único, raw_payload, signature_valid, processed_at, error).
- **Suporte:** `tickets` (tenant_id, assunto, status); `ticket_messages` (author, is_admin, body); `ticket_attachments` (storage_key, mime, size).

Toda tabela de tenant tem `tenant_id` indexado; o acesso passa por repositórios que exigem `tenantId` na assinatura, com testes de isolamento.

## Fases

- **Fase 0:** monorepo, tooling (Oxlint, Prettier, lefthook, `check:no-else`), Docker Compose, CI, layout base e autenticação.
- **Fase 1:** schema, seeds realistas, região e fornecedores.
- **Fase 2:** lojas conectadas (OAuth mock), publicação com fila e status.
- **Fase 3:** dashboard de vendas e financeiro.
- **Fase 4:** suporte, conector real do Mercado Livre (depois os demais), webhooks e E2E.
