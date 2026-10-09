# Arquitetura e padrões de código

Decisões pontuais, com data e motivo, ficam em [decisions.md](decisions.md).

## Organização de pastas

O monorepo separa aplicações (processos que rodam) de pacotes (código reutilizável sem estado de processo):

```
apps/web                   TanStack Start: UI, server functions e rotas HTTP
  src/routes/              uma rota por arquivo (file-based routing); só compõe a tela
  src/features/<domínio>/  tudo que é de um domínio e não é JSX: server functions
                           (*.functions.ts), query options (*.queries.ts), helpers
                           server-only (*.server.ts), hooks (use-*.ts) e regras puras
  src/components/<área>/   componentes de UI do domínio <área>; data/, form/, feedback/ e
                           layout/ são genéricos; ui/ é o shadcn gerado
  src/hooks/, src/lib/     hooks e utilitários genéricos, sem domínio (seleção, debounce,
                           cache otimista, datas); não importam de features/ nem components/
  src/lib/server/          infraestrutura server-only: ambiente, banco, auth, filas, storage
apps/worker
  src/processors/          um arquivo por fila (processador BullMQ)
  src/lib/                 apoio aos processadores: acesso à loja, rate limiter
packages/database          schema Drizzle, migrations, seeds e repositórios por tenant
  src/repositories/sql/    fragmentos SQL reutilizados pelos repositórios
packages/marketplaces      interface MarketplaceConnector e conectores (mock/, mercado-livre/)
packages/shared            código sem dependência de outros pacotes do monorepo
  src/domain/              regras de negócio puras: dinheiro, finanças, período, CEP, regras
                           de anúncio e de chamado
  src/runtime/             infraestrutura comum: erros, logger, ambiente, filas, cifra de tokens
  src/schemas/             schemas Zod das bordas (search params, formulários, payloads)
```

Testes ficam ao lado do módulo e têm o nome dele (`stores.ts` → `stores.test.ts`); fixtures compartilhadas ficam em `src/testing/`.

Regras de dependência:

- `apps/*` dependem de `packages/*`; pacotes nunca importam de apps.
- `packages/shared` não depende de nenhum outro pacote do monorepo.
- Arquivos `*.functions.ts` são importados pelo cliente: helpers que tocam banco, segredos ou `node:*` ficam em `src/lib/server/` (infraestrutura) ou `features/<domínio>/*.server.ts` (domínio) e nunca são exportados de um `*.functions.ts`.
- Acesso a dados passa por repositórios (`packages/database/src/repositories`), que recebem o `tenantId` explicitamente. Rotas e processadores não montam SQL.

## Responsabilidade única (SRP)

Cada módulo tem um motivo para mudar:

| Camada                  | Responsabilidade                                        | Não faz                        |
| ----------------------- | ------------------------------------------------------- | ------------------------------ |
| Rota (`routes/`)        | Validar search params, prefetch e compor componentes    | Regra de negócio, SQL          |
| Server function         | Validar entrada (Zod), autorizar (tenant), orquestrar   | Formatar UI, SQL direto        |
| Repositório             | Consultas e escritas escopadas por tenant               | Validar entrada HTTP, logar    |
| Processador (worker)    | Um tipo de job: carregar, executar, registrar resultado | Decidir retentativa por string |
| Conector de marketplace | Traduzir a interface comum para a API do marketplace    | Persistir dados                |

Funções têm no máximo 60 linhas, 4 parâmetros (acima disso, um objeto de parâmetros) e 3 níveis de aninhamento. O Oxlint barra o que passar disso.

## Regras de código

1. **Composição em vez de herança.** Erros são um único `AppError` com `code` e `details`, criados por funções de fábrica (`notFoundError`, `marketplaceError`...) e verificados com `hasErrorCode`. Conectores e processadores são objetos criados por fábricas que recebem dependências.
2. **Nomes completos.** Sem abreviações (`database`, `environment`, `dependencies`, `milliseconds`). Exceções: siglas consagradas (`url`, `id`, `cep`, `csv`, `api`), nomes impostos por APIs externas (`q` do Mercado Livre, `deps` do TanStack Router, `env` do Playwright) e colunas já migradas (`access_token_enc`).
3. **Sem `else`.** Early return e guard clauses; o `check:no-else` roda no pre-commit e no CI.
4. **Null checks explícitos.** Sem `!` e sem `any`; `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` ligados.
5. **Validação nas bordas.** Toda entrada externa (search params, corpo HTTP, webhooks, respostas de APIs, variáveis de ambiente) passa por um schema Zod antes de entrar no domínio. Search params inválidos caem no padrão via `withFallback`/`optionalParameter`.
6. **Erros.** `try/catch` só onde há decisão a tomar (converter em erro tipado, tentar de novo, responder ao usuário). Nenhum `catch` vazio: ou relança, ou registra com `logger`, ou converte em resultado tipado documentado.
7. **Async.** Toda função que faz I/O é `async` e usa `await`; não usamos cadeias `.then()/.catch()` em Promises. Funções puras (cálculo, formatação) continuam síncronas: marcar uma função pura como `async` só obrigaria os chamadores a esperar sem motivo.
8. **Imutabilidade.** `const` por padrão, tipos `readonly` em contextos e parâmetros, cópias (`[...lista]`, `{ ...objeto }`) em vez de mutação de argumentos (`no-param-reassign`).
9. **Logs estruturados.** `logger.{debug,info,warn,error}(evento, campos)` gera uma linha JSON. `LOG_LEVEL` filtra o nível; chaves sensíveis (`token`, `secret`, `password`, `authorization`, `cookie`, `email`) são substituídas por `[redacted]`. Nunca registrar CEP, endereço ou corpo de requisição.
10. **Configuração.** Segredos e parâmetros vêm de variáveis de ambiente validadas na inicialização (`apps/*/src/environment.ts`). Nenhum segredo tem valor padrão no código; o CI gera segredos efêmeros a cada execução.

## Escolha da stack

| Necessidade      | Escolha                                 | Por quê                                                                                        |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Full-stack React | TanStack Start                          | Server functions tipadas ponta a ponta, SSR e roteamento por arquivo com search params tipados |
| Dados no cliente | TanStack Query                          | Cache, prefetch no SSR e polling sem estado global manual                                      |
| Tabelas e forms  | TanStack Table / Form                   | Headless, tipados e do mesmo ecossistema                                                       |
| Banco            | PostgreSQL + Drizzle                    | SQL explícito e tipado, migrations versionadas, sem runtime pesado                             |
| Autenticação     | Better Auth                             | Organizations (multi-tenant) e admin como plugins                                              |
| Validação        | Zod 4                                   | Um schema serve para tipo, validação no servidor e no formulário                               |
| Filas            | BullMQ + Redis                          | Retentativas com backoff, jobs agendados e idempotência por `jobId`                            |
| Qualidade        | Oxlint + Prettier + Vitest + Playwright | Lint type-aware rápido, formatação estável, testes unitários e E2E                             |

## Exceções do lint

As overrides em `.oxlintrc.json` são poucas e por arquivo, nunca por comentário:

- `promise/prefer-await-to-then` desligada só em `packages/shared/src/schemas/fallback.ts`: o `.catch()` do Zod não é uma Promise; o helper concentra o falso positivo num único lugar.
- `max-lines-per-function` e `max-nested-callbacks` desligadas em testes (`*.test.ts`, `e2e/**`): blocos `describe` agrupam casos e não são funções de produção.
