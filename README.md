# SellBridge

SaaS de dropshipping/intermediação: o revendedor conecta suas lojas em marketplaces (Shopee, Mercado Livre, TikTok Shop), escolhe produtos de fornecedores atacadistas da sua região, publica nas lojas e acompanha vendas, comissões e financeiro.

## Stack

pnpm + Turborepo · TanStack Start/Router/Query/Table/Form · Tailwind v4 + shadcn/ui · PostgreSQL + Drizzle · Better Auth · Zod · BullMQ + Redis · Oxlint · Prettier · Vitest · Playwright · Docker Compose. Decisões em [docs/decisions.md](docs/decisions.md); arquitetura e padrões de código em [docs/architecture.md](docs/architecture.md); plano em [docs/plan.md](docs/plan.md).

## Como rodar

Pré-requisitos: Node 24+, Docker e corepack (`corepack enable`).

```bash
cp .env.example .env          # gere BETTER_AUTH_SECRET, TOKEN_ENCRYPTION_KEY e MOCK_WEBHOOK_SECRET (loja simulada)
pnpm install
pnpm services:up              # Postgres + Redis
pnpm database:migrate
pnpm database:seed
pnpm dev                      # web em http://localhost:3000 + worker (filas)
```

O e-mail definido em `ADMIN_EMAILS` vira administrador ao se cadastrar. Os logs são JSON estruturado; `LOG_LEVEL` define o nível mínimo (`debug`, `info`, `warn`, `error`).

### Contas de demonstração (criadas pelo seed)

| Conta                    | Senha        | O que tem                                                                              |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| `demo@sellbridge.local`  | `demo12345`  | Região Belo Horizonte/MG, 2 lojas simuladas, 14 anúncios e cerca de 6 meses de pedidos |
| `admin@sellbridge.local` | `admin12345` | Papel de administrador                                                                 |

As senhas vêm de `SEED_DEMO_PASSWORD` e `SEED_ADMIN_PASSWORD` no `.env` (os valores acima são os do `.env.example`); os testes E2E usam as mesmas variáveis. `pnpm database:seed -- --reset` limpa os dados de domínio e recria tudo.

### Mercado Livre

Crie um aplicativo em developers.mercadolivre.com.br, configure o redirect `{APP_URL}/api/oauth/mercado_livre/callback` e a URL de notificações `{APP_URL}/api/webhooks/mercado_livre` (tópico `orders_v2`), e preencha `MERCADO_LIVRE_CLIENT_ID` e `MERCADO_LIVRE_CLIENT_SECRET`. Sem essas variáveis, a opção aparece como "Em breve". Referência dos endpoints usados: [docs/marketplaces/mercado-livre.md](docs/marketplaces/mercado-livre.md).

### Testando a publicação com o marketplace simulado

Em **Lojas conectadas**, use **Conectar Loja simulada**. No anúncio, inclua `[falha]` no título para simular uma recusa permanente, ou `[instavel]` para simular instabilidade (o job é repetido com backoff até esgotar as tentativas). Em **Publicações**, o botão **Simular venda** envia um webhook assinado que vira pedido no financeiro.

## Qualidade

| Comando                             | O que faz                                                  |
| ----------------------------------- | ---------------------------------------------------------- |
| `pnpm format` / `pnpm format:check` | Prettier                                                   |
| `pnpm lint`                         | Oxlint (inclui regras type-aware)                          |
| `pnpm check:no-else`                | Falha se houver `else` em `apps/*/src` ou `packages/*/src` |
| `pnpm typecheck`                    | `tsc --noEmit` em todos os pacotes (TS 7, strict)          |
| `pnpm test`                         | Vitest                                                     |
| `pnpm test:e2e`                     | Playwright (precisa do banco rodando)                      |

O hook de pre-commit (lefthook) formata, linta e roda o `check:no-else`. O CI no GitHub Actions roda tudo isso e os testes E2E.

## Estrutura

```
apps/web               TanStack Start (painel)
apps/worker            filas BullMQ (publicação, sync, webhooks)
packages/database      schema Drizzle, migrations, seeds, repositórios por tenant
packages/marketplaces  conectores (mock, Mercado Livre, Shopee, TikTok Shop)
packages/shared        schemas Zod, dinheiro em centavos, CEP, erros, ambiente, logger
packages/config        tsconfig base
```

## Entregas

- **Fase 4:** suporte com anexos (validados pelo conteúdo), histórico e status, e visão de admin para responder/encerrar; conector real do Mercado Livre (OAuth com PKCE, publicação, estoque/preço, pedidos, notificações) atrás da mesma interface; webhooks idempotentes com fila; sincronização periódica de estoque e preço; "Simular venda" para testar o fluxo completo; testes E2E dos fluxos críticos.
- **Fase 3:** dashboard com KPIs (vendas, receita, lucro, ticket médio), comparação com o período anterior, gráfico de evolução por dia/semana, filtro por período e por loja, vendas por loja e produtos mais vendidos; financeiro com lucro, comissões, devoluções e reembolsos por pedido e por período, tabela com ordenação/filtros/paginação no servidor e exportação CSV; estados vazios e checklist de primeiros passos.
- **Fase 2:** pacote `marketplaces` (interface única, conector mock completo, criptografia de tokens, HTTP com retry/backoff e rate limit), lojas conectadas via OAuth (mock), publicação em uma ou várias lojas com fila BullMQ no worker, status acompanhável e reprocessamento, renovação automática de tokens.
- **Fase 1:** schema completo do domínio (região, fornecedores, lojas, anúncios, pedidos, webhooks, suporte), seeds determinísticos, onboarding por CEP (cache + BrasilAPI + ViaCEP), fornecedores filtrados pela região e catálogo com busca, filtros, ordenação e paginação na URL.
- **Fase 0:** monorepo, tooling (Oxlint, Prettier, lefthook, `check:no-else`), Docker Compose, CI, layout base (sidebar colapsável, modo claro/escuro) e autenticação (cadastro, login, logout, organização por usuário, papel admin).
