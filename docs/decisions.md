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
