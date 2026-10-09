# Registro de decisões

## 2026-10-08 — Prettier no lugar do Oxfmt

Oxfmt está em 0.72 (beta, pré-1.0). Conforme a regra do projeto, usamos Prettier até o Oxfmt estabilizar.

## 2026-10-08 — lefthook para hooks de git

Um binário só, roda comandos em paralelo e dispensa husky + lint-staged.

## 2026-10-08 — Tenant = organization do Better Auth

Plugin organization; uma organização criada automaticamente por usuário no MVP.

## 2026-10-08 — Cálculo de lucro

Lucro por item = preço de venda − custo do fornecedor − taxa do marketplace − ajustes (devolução/reembolso). Taxa da plataforma configurável, inicialmente 0. Todos os valores em centavos (inteiros).

## 2026-10-08 — Região

UF + cidade derivadas do CEP. BrasilAPI como provedor principal, ViaCEP como fallback, cache em Postgres. Fornecedor aparece se cobre a UF ou a cidade.

## 2026-10-08 — Armazenamento de anexos

Interface `FileStorage`; implementação em disco local no desenvolvimento. S3/R2 depois.

## 2026-10-08 — Criptografia de tokens

AES-256-GCM com chave em `TOKEN_ENCRYPTION_KEY`.

## 2026-10-08 — TypeScript 7 e lint type-aware

O lint type-aware do Oxlint (oxlint-tsgolint) exige TypeScript 7. Tentaremos TS 7; se for incompatível com TanStack Start/Drizzle, voltamos para TS 5.x e deixamos o type-aware desligado.

## 2026-10-08 — Fluxo de git

Commits direto na `main` (pedido do usuário).

## 2026-10-08 — Revisão das decisões ao iniciar a Fase 0

- **TypeScript 7 confirmado.** `tsc --noEmit` (TS 7.0.2) funciona com TanStack Start, Drizzle e Better Auth. Lint type-aware ligado via `oxlint-tsgolint` (`options.typeAware` no `.oxlintrc.json`).
- **pnpm 12.** Scripts de build de dependências ficam bloqueados por padrão; liberados explicitamente em `allowBuilds` no `pnpm-workspace.yaml` (`esbuild`, `lefthook`).
- **Drizzle 0.45 (estável)** em vez do 1.0 RC que a documentação atual sugere. Migraremos quando o 1.0 sair do RC.
- **Validador das server functions:** a versão instalada do TanStack Start usa `.inputValidator()` (a página "build from scratch" ainda mostra `.validator()`). Seguimos os tipos instalados.
- **`.env` único na raiz**, carregado por `loadRootEnv()` (`process.loadEnvFile`) no web e no worker, e por `node --env-file-if-exists` nos scripts do `packages/db`.

## 2026-10-08 — Papel de admin

Plugin `admin` do Better Auth. O e-mail listado em `ADMIN_EMAILS` recebe `role = "admin"` no cadastro (hook `databaseHooks.user.create.before`). Admin gerencia fornecedores e responde chamados.

## 2026-10-08 — Organização criada no cadastro

`databaseHooks.user.create.after` cria a organização do usuário e `databaseHooks.session.create.before` define `activeOrganizationId`. O `tenantMiddleware` das server functions exige essa organização e injeta `tenantId` no contexto.

## 2026-10-08 — Taxa da plataforma

No MVP vem de `PLATFORM_FEE_BPS` (basis points, padrão 0) em vez de uma tabela `platform_settings`. Vira tabela quando houver tela de configuração.

## 2026-10-08 — shadcn/ui

Preset `radix-nova` (Radix + Lucide). Componentes gerados em `src/components/ui/` são código vendorizado: ficam fora do Oxlint e do `check:no-else`, mas passam pelo typecheck estrito. Ajustes feitos para `exactOptionalPropertyTypes`: `dropdown-menu.tsx` (prop `checked`) e `sonner.tsx` (troca de `next-themes` pelo nosso `useTheme`).

## 2026-10-08 — Identidade visual

Neutra e própria do SellBridge (paleta neutra do shadcn, modo claro/escuro). Sem relação com a identidade do Envio Velox.

## 2026-10-08 — Limitação conhecida do `check:no-else`

O scanner ignora comentários, strings e template literals. Regex literais contendo aspas (ex.: `/"/`) podem confundi-lo; nesse caso, extraia a regex para `new RegExp("...")`.

## 2026-10-08 — Testes E2E e hidratação

Em dev, o primeiro carregamento demora a hidratar. Os testes navegam com `gotoHydrated()` (espera `networkidle`) antes de interagir com formulários.

## 2026-10-08 — Fluxo de git (atualização)

Commits locais na `main`. Push para o GitHub só após confirmação do usuário.

## 2026-10-08 — Fase 1: região e fornecedores

- **Fluxo do CEP:** cache em `cep_cache` (TTL de 30 dias), depois BrasilAPI e, em seguida, ViaCEP. A BrasilAPI responde 404 tanto para CEP inexistente quanto quando os provedores dela falham; por isso um 404 é confirmado no ViaCEP antes de virar "CEP não encontrado". As respostas dos provedores passam por Zod.
- **Visibilidade de fornecedores:** um fornecedor aparece se `supplier_coverage` cobre a UF inteira (`city` nulo) ou a cidade do tenant (comparação sem diferenciar maiúsculas). Acessar catálogo ou produto fora da região resulta em `NotFoundError`.
- **Filtro de preço do catálogo** usa o custo do fornecedor (valor de atacado), em centavos na URL.
- **Loaders sem bloqueio:** os loaders aguardam os dados só no SSR (`prefetchOnServer`). Nas navegações do cliente, a URL muda na hora e o componente mostra seu próprio carregamento (`keepPreviousData`), em vez de travar a mudança de filtro.
- **Sessão sem organização ativa:** a sessão do cadastro pode nascer antes da organização. O `tenantMiddleware` cai para a primeira organização do usuário e a grava como ativa.
- **Seeds:** dados determinísticos (PRNG com semente fixa). `pnpm db:seed` é idempotente; `pnpm db:seed -- --reset` limpa o domínio e recria. Contas: `demo@sellbridge.local / demo12345` (Belo Horizonte, 2 lojas simuladas, cerca de 6 meses de pedidos) e `admin@sellbridge.local / admin12345`. As imagens de produto vêm do picsum.photos e os logos do DiceBear: são placeholders de desenvolvimento.
- **Lojas da conta demo** usam o marketplace `mock`, porque não há tokens reais.
- **Testes de integração do banco** rodam contra o Postgres real (`fileParallelism: false`). O CI sobe o Postgres no job de checagens.
