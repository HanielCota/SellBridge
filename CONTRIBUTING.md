# Contributing to SellBridge

Thanks for your interest in contributing! This guide covers how to set up the project and what we expect from a pull request.

## Setup

Follow [Getting started](README.md#getting-started) in the README. You need Node 24+, Docker, and corepack.

## Workflow

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Create a branch from `main` named after the change, such as `feat/bulk-pricing` or `fix/webhook-retry`.
3. Keep commits focused and use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
4. Open a pull request against `main` and fill in the template.

## Code conventions

Architecture and code conventions are documented in [docs/architecture.md](docs/architecture.md), and past decisions in [docs/decisions.md](docs/decisions.md). A few rules are enforced automatically:

- No `else` in `apps/*/src` or `packages/*/src` (`pnpm check:no-else`); prefer early returns.
- TypeScript strict mode, type-aware Oxlint rules, and Prettier formatting.
- Money is stored in cents; data access goes through the tenant-scoped repositories in `packages/database`.
- The public API (`/api/v1`, guide in [docs/api.md](docs/api.md)) only takes backward-compatible changes: new endpoints, response fields, optional parameters, event types, or error codes. Anything breaking goes to a new version. Describe every new field with `.describe()` so it shows up in the generated OpenAPI docs.

## Before opening a pull request

```bash
pnpm format:check
pnpm lint
pnpm check:no-else
pnpm typecheck
pnpm test
pnpm test:e2e   # requires the database running
```

The lefthook pre-commit hook runs formatting, linting, and `check:no-else` for you, and CI runs everything above. Add or update tests for any behavior you change.

## Reporting security issues

Do not open a public issue for vulnerabilities. Follow [SECURITY.md](SECURITY.md) instead.
