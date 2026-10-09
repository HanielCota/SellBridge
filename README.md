# SellBridge

SaaS de dropshipping/intermediação: o revendedor conecta suas lojas em marketplaces (Shopee, Mercado Livre, TikTok Shop), escolhe produtos de fornecedores atacadistas da sua região, publica nas lojas e acompanha vendas, comissões e financeiro.

## Stack

pnpm + Turborepo · TanStack Start/Router/Query/Table/Form · Tailwind v4 + shadcn/ui · PostgreSQL + Drizzle · Better Auth · Zod · BullMQ + Redis · Oxlint · Prettier · Vitest · Playwright · Docker Compose. Decisões em [docs/decisions.md](docs/decisions.md); plano em [docs/plan.md](docs/plan.md).

## Como rodar

Pré-requisitos: Node 24+, Docker e corepack (`corepack enable`).

```bash
cp .env.example .env          # gere BETTER_AUTH_SECRET e TOKEN_ENCRYPTION_KEY
pnpm install
pnpm db:up                    # Postgres + Redis
pnpm db:migrate
pnpm db:seed
pnpm dev                      # web em http://localhost:3000
```

O e-mail definido em `ADMIN_EMAILS` vira administrador ao se cadastrar.

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
packages/db            schema Drizzle, migrations, seeds, repositórios por tenant
packages/marketplaces  conectores (mock, Mercado Livre, Shopee, TikTok Shop)
packages/shared        schemas Zod, dinheiro em centavos, CEP, erros, env
packages/config        tsconfig base
```

## Entregas

- **Fase 0:** monorepo, tooling (Oxlint, Prettier, lefthook, `check:no-else`), Docker Compose, CI, layout base (sidebar colapsável, modo claro/escuro) e autenticação (cadastro, login, logout, organização por usuário, papel admin).
