<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/sellbridge-logo-dark.png">
  <img src="apps/web/public/brand/sellbridge-logo-light.png" alt="SellBridge" width="420">
</picture>

<p><strong>The bridge between wholesale suppliers in your region and your marketplace stores.</strong></p>

[![CI](https://github.com/HanielCota/SellBridge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/HanielCota/SellBridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-00a98a)](LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A524-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-Turborepo-F69220?logo=pnpm&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-8-FF4438?logo=redis&logoColor=white)

[Getting started](#getting-started) · [Public API](#public-api) · [Quality](#quality) · [Structure](#structure) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md)

</div>

---

SellBridge is a dropshipping/reselling SaaS: resellers connect their stores on marketplaces (Shopee, Mercado Livre, TikTok Shop), pick products from wholesale suppliers in their region, publish them to their stores, and track sales, fees, and finances.

## Features

- **Suppliers by region** — onboarding by CEP (Brazilian postal code) and a catalog filtered to nearby wholesalers, with search, filters, and sorting.
- **Connected stores** — OAuth with the marketplaces (real Mercado Livre connector, plus a simulated store for testing) and automatic token renewal.
- **Bulk publishing** — publish one listing to one or many stores through a job queue, with trackable status and retries.
- **Sync** — periodic stock and price sync, orders received through idempotent webhooks.
- **Dashboard and finances** — KPIs, comparison with the previous period, profit, fees, returns, and CSV export.
- **Support** — tickets with attachments, history, and an admin view.
- **SaaS billing** — organization subscriptions, monthly Stripe checkout, automatic renewals, invoices and cancellation through the customer portal. Setup: [docs/billing.md](docs/billing.md).
- **Public API** — REST API with organization-scoped keys, scopes, OpenAPI docs, events, and signed webhooks.

## Stack

| Layer       | Technologies                                                     |
| ----------- | ---------------------------------------------------------------- |
| Monorepo    | pnpm · Turborepo                                                 |
| Web         | TanStack Start/Router/Query/Table/Form · Tailwind v4 · shadcn/ui |
| Data        | PostgreSQL · Drizzle · Zod                                       |
| Auth        | Better Auth (email/password and Google)                          |
| Queues      | BullMQ · Redis                                                   |
| Quality     | Oxlint · Prettier · Vitest · Playwright · lefthook               |
| Local infra | Docker Compose                                                   |

Decisions live in [docs/decisions.md](docs/decisions.md); architecture and code conventions in [docs/architecture.md](docs/architecture.md); the roadmap in [docs/plan.md](docs/plan.md). These documents are written in Portuguese.

## Getting started

Requirements: Node 24+, Docker, and corepack (`corepack enable`).

```bash
cp .env.example .env          # generate BETTER_AUTH_SECRET, TOKEN_ENCRYPTION_KEY and MOCK_WEBHOOK_SECRET (simulated store)
pnpm install
pnpm services:up              # Postgres + Redis
pnpm database:migrate
pnpm database:seed
pnpm dev                      # web on http://localhost:3000 + worker (queues)
```

Postgres 18 and Redis 8 run via Docker Compose. If you already had a local Postgres 17 database (the `pgdata` volume), migrate your data, because 18 uses a new volume (`postgres-data`): run `pg_dump -Fc` against the old container, run `pnpm services:up`, and restore with `pg_restore --no-owner`. The old volume stays intact until you remove it.

The email set in `ADMIN_EMAILS` becomes an administrator once ownership of it is proven: when signing up with Google, or through the confirmation link sent after a password sign-up. In that case the chosen password is discarded and a link to set a new one is sent, because whoever signed up may not own the email. Logs are structured JSON; `LOG_LEVEL` sets the minimum level (`debug`, `info`, `warn`, `error`).

### Page error diagnostics

The generic page error screen automatically sends a bounded report to the same application's `/api/diagnostics/errors` endpoint. Find `web.route_error` in the web container's Coolify logs, or search for the reference UUID shown on the screen after successful delivery. Records include the route template (not the concrete URL), UTC occurrence time, error name, redacted message, code locations, and both browser and server build IDs. Different build IDs can identify a tab still running an older deployment. The Docker build supplies one shared `VITE_BUILD_ID` to both client and server: Coolify's `SOURCE_COMMIT` build argument when available, otherwise a UUID generated before Vite starts. Local builds can supply `VITE_BUILD_ID` explicitly; without it or `SOURCE_COMMIT`, the ID is `development`.

Server function failures also emit `web.server_function_error` before production error serialization hides the original cause. Match the function, build and time to browser reports. Request bodies, query parameters, cookies, account identifiers and form contents are not collected. Diagnostic text masks URLs, emails, quoted values and common credential patterns; treat logs as operational data because unexpected error messages can still contain application-specific values.

The receiver does not require a working database or session. It accepts only same-origin JSON, validates its schema, limits bodies to 8 KiB and admits at most 60 reports per minute per server process. The browser coalesces identical failures for 30 seconds and sends at most 10 reports per minute. Reporting failures never block retrying the page; offline, blocked or rate-limited reports are not queued, and the reference appears only after the server accepts the report. Logs follow the container's existing retention policy; this feature does not add a database table or external monitoring service. Browser reports are untrusted diagnostic evidence.

### Demo accounts (created by the seed)

| Account                  | Password     | What it has                                                                    |
| ------------------------ | ------------ | ------------------------------------------------------------------------------ |
| `demo@sellbridge.local`  | `demo12345`  | Belo Horizonte/MG region, 2 simulated stores, 14 listings, ~6 months of orders |
| `admin@sellbridge.local` | `admin12345` | Administrator role                                                             |

Passwords come from `SEED_DEMO_PASSWORD` and `SEED_ADMIN_PASSWORD` in `.env` (the values above are the `.env.example` defaults); the E2E tests use the same variables. `pnpm database:seed -- --reset` wipes domain data and recreates everything.

### Password reset and Google sign-in

Password reset sends the link by email through [Resend](https://resend.com) (`RESEND_API_KEY`, `EMAIL_FROM`). Without the key, in development the email with the link shows up in the server log (`email.development_preview`); in production it is not sent.

For Google sign-in, create an OAuth client in Google Cloud with the redirect `{BETTER_AUTH_URL}/api/auth/callback/google` and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Without both variables, the "Continuar com Google" button is hidden.

### Mercado Livre

Create an app at developers.mercadolivre.com.br, configure the redirect `{APP_URL}/api/oauth/mercado_livre/callback` and the notifications URL `{APP_URL}/api/webhooks/mercado_livre` (topic `orders_v2`), and set `MERCADO_LIVRE_CLIENT_ID` and `MERCADO_LIVRE_CLIENT_SECRET`. Without these variables, the option shows as "Em breve" (coming soon). Endpoint reference: [docs/marketplaces/mercado-livre.md](docs/marketplaces/mercado-livre.md).

### Testing publishing with the simulated marketplace

The app UI is in Portuguese. In **Lojas conectadas** (connected stores), use **Conectar Loja simulada** (connect simulated store). In a listing, put `[falha]` in the title to simulate a permanent rejection, or `[instavel]` to simulate instability (the job is retried with backoff until attempts run out). In **Publicações** (publications), the **Simular venda** (simulate sale) button sends a signed webhook that becomes an order in the finances view.

## Managing the supplier catalog

Enable **Modo administrador** in the account menu and open **Fornecedores** (`/admin/fornecedores`). Create a supplier and its state/city coverage, then manage products on `/admin/fornecedores/$supplierId`. An empty coverage city covers the entire state. Product search and pagination are stored in the URL.

The supplier page provides a downloadable UTF-8 CSV model. Files may use semicolons or commas (quote decimal commas in comma-delimited files), with at most 2 MiB and 1,000 products. The preview shows create/update counts and physical line numbers for every invalid row. All errors must be corrected before confirming. Confirmation revalidates the file and catalog revision, then upserts every row in one transaction using `(supplier_id, sku)`, preserving product IDs and listing/order references.

```csv
sku;titulo;descricao;custo;estoque;categoria;imagens;ativo;preco_sugerido
EXEMPLO-001;Produto de exemplo;Descrição do produto;12,90;10;;https://example.com/produto.jpg;sim;19,90
```

Required columns: `sku`, `titulo`, `custo`, `estoque`. Optional columns: `descricao`, `categoria` (an existing category slug), `imagens` (HTTP/HTTPS URLs separated by `|`), `ativo` (`sim`/`nao`, `true`/`false`, or `1`/`0`), and `preco_sugerido`. Money accepts `12,90` or `12.90`, without grouping separators, and is stored as integer cents. Blank descriptions, categories, and images clear their values. A blank active flag or suggested price preserves the existing value; new products default to active and the existing 50% markup rule with a retail ending in `,90`.

Supplier and product deactivation only hides items from the reseller catalog. Existing listings and orders remain available, and published listings still receive stock synchronization. Product saves and imports enqueue `stock-price-sync` after committing; if Redis is unavailable, the UI reports deferred synchronization and the worker's existing 15-minute scheduler recovers it from database values. Listing prices remain the reseller's chosen prices; supplier cost changes do not automatically reprice existing listings.

The existing schema already contains `active` columns and the unique supplier/SKU index; this feature requires no migration or production seed.

## Public API

Other systems (ERPs, spreadsheets, in-house tools) can integrate through a versioned REST API at `/api/v1`. Create a key in **Integrações** (account menu), then:

```bash
curl http://localhost:3000/api/v1/me -H "Authorization: Bearer sb_live_..."
```

Interactive reference at `/api/v1/docs` and the OpenAPI document at `/api/v1/openapi.json`. The guide (authentication, scopes, pagination, errors, rate limits, idempotency, events, and webhook signatures) is in [docs/api.md](docs/api.md), in Portuguese.

## Quality

| Command                             | What it does                                                    |
| ----------------------------------- | --------------------------------------------------------------- |
| `pnpm format` / `pnpm format:check` | Prettier                                                        |
| `pnpm lint`                         | Oxlint (including type-aware rules)                             |
| `pnpm check:no-else`                | Fails if there is an `else` in `apps/*/src` or `packages/*/src` |
| `pnpm typecheck`                    | `tsc --noEmit` across all packages (TS 7, strict)               |
| `pnpm test`                         | Vitest                                                          |
| `pnpm test:e2e`                     | Playwright (requires the database running)                      |

The pre-commit hook (lefthook) formats, lints, and runs `check:no-else`. CI on GitHub Actions runs all of that plus the E2E tests.

## Structure

```
apps/web               TanStack Start (dashboard)
apps/worker            BullMQ queues (publishing, sync, webhooks)
packages/database      Drizzle schema, migrations, seeds, tenant-scoped repositories
packages/marketplaces  connectors (mock, Mercado Livre, Shopee, TikTok Shop)
packages/shared        Zod schemas, money in cents, CEP, errors, environment, logger
packages/config        base tsconfig
```

## Milestones

- **Phase 4:** support with attachments (validated by content), history and status, and an admin view to reply/close; real Mercado Livre connector (OAuth with PKCE, publishing, stock/price, orders, notifications) behind the same interface; idempotent queued webhooks; periodic stock and price sync; "Simular venda" to test the flow end to end; E2E tests for critical flows.
- **Phase 3:** dashboard with KPIs (sales, revenue, profit, average order value), comparison with the previous period, daily/weekly trend chart, filters by period and store, sales by store and best-selling products; finances with profit, fees, returns, and refunds per order and per period, a table with server-side sorting/filtering/pagination and CSV export; empty states and a getting-started checklist.
- **Phase 2:** `marketplaces` package (single interface, mock connector, token encryption, HTTP with retry/backoff and rate limiting), stores connected via OAuth (mock), publishing to one or many stores through a BullMQ queue in the worker, trackable status and retries, automatic token renewal.
- **Phase 1:** domain schema (region, suppliers, stores, listings, orders, webhooks, support), deterministic seeds, onboarding by CEP (cache + BrasilAPI + ViaCEP), suppliers filtered by region, and a catalog with search, filters, sorting, and pagination in the URL.
- **Phase 0:** monorepo, tooling (Oxlint, Prettier, lefthook, `check:no-else`), Docker Compose, CI, base layout (collapsible sidebar, light/dark mode), and authentication (sign-up, login, logout, one organization per user, admin role).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md).

## Deployment assets

The production server retains old assets on persistent storage so open tabs continue
working after deployments. See [deploy-assets.md](docs/deploy-assets.md).

## License

[MIT](LICENSE) © 2026 Haniel Fialho
