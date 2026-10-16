# Andamento do Chat F (infra, só servidor, Modo MVP)

Branch `claude/client-f-326676` · banco `sellbridge_desk_f` · Redis db 10 · preview 3900 · e2e 3190 · 3191 · db 11.

## Em andamento

- ⏸A aprovado em 2026-10-16 (alertas por webhook). Fila do F fechada em 2026-10-16 (F1, F2, 32.a, 32.d, 32.e, notas do 32.b/32.c e F3).

## Ambiente

- 2026-10-16: banco `sellbridge_desk_f` criado, migrate (até 0032) e seed ok.
- O `.env` da worktree não foi criado: as regras de permissão do projeto negam ler ou gravar `.env`. Os comandos rodam com as variáveis exportadas por um script fora do repositório (scratchpad da sessão), com segredos de desenvolvimento gerados na hora.

## Fila

| Item | Título                                       | Situação | Commit            | Notas                                        |
| ---- | -------------------------------------------- | -------- | ----------------- | -------------------------------------------- |
| F1   | Limpeza da loja viva duplicada antes da 0023 | ✅       | e2061f0           | nota em `docs/deploy-infra.md`               |
| F2   | Remover o que o CPF deixou sem uso           | ✅       | 99bb36f · d75be32 | migration 0034, senha da vez com o principal |
| 32.a | Alertas de erro                              | ✅       | d145480           | `ALERT_WEBHOOK_URL`                          |
| 32.d | Health do Redis                              | ✅       | 895984b           |                                              |
| 32.e | Sync em paralelo por loja                    | ✅       | 06f90a7           | até 5 lojas ao mesmo tempo                   |
| 32.b | Backup e restore                             | 📝       | (docs)            | fase 2: nota em `docs/deploy-infra.md`       |
| 32.c | Adapter S3/R2                                | 📝       | (docs)            | fase 2: nota em `docs/deploy-infra.md`       |
| F3   | Seed mais completo                           | ✅       | 39ce5bb           | admin com loja, 3 clientes, 7 chamados       |

## Refinar depois

- `seed.test.ts` leva ~70 s (seed completo duas vezes num banco descartável) e deixa a máquina carregada durante o `pnpm test`: numa rodada, `stock-reservations.test.ts` ("lists one entry per short order…") estourou o timeout de 5 s; sozinho e na rodada seguinte passou. Dá para encolher o seed do teste (menos pedidos por conta) ou movê-lo para um job próprio.
- `.local/scripts/audit.ts` só audita a pasta principal: rodado da worktree, quebrou num arquivo que só existe lá. Pede um parâmetro de raiz.
- O teste paralelo do sync (`stock-price-sync-parallel.test.ts`) sincroniza a fila inteira do banco, como o teste antigo; anúncios de outros testes no mesmo banco geram logs de falha de token. Filtrar por tenant exigiria mudar o `findTargetsNeedingSync`.

## Histórico

### 2026-10-16 · F1 · limpeza da loja viva duplicada antes da 0023 (e2061f0)

- A 0023 ganhou um `UPDATE` antes de `store_connections_live_shop_idx`: fica viva a conexão mais recente (`connected_at`, `id`); as outras viram `disconnected`, sem tokens, com `last_error`. O Drizzle só compara o `when` (`pg-core/dialect.js:56-69`), então quem já aplicou a 0023 não roda de novo.
- Teste novo `M2: 0023 keeps one live connection per shop…` (`migrations.test.ts`); antes falhava com `23505 could not create unique index "store_connections_live_shop_idx"`.
- Portões: C1–C4 ✅; C5 1558/1558 (shared 438, marketplaces 186, database 277, web 573, worker 77, raiz 7); C6 ✅; M1 ✅ (teste M1), M2 ✅ (teste novo, conferido o efeito nas 3 linhas), M3 n/a (sem entrada nova no journal).
- Revisão independente: sem bug real. Acatados: limpar tokens como o `disconnectStore`; a nota diz que o `last_error` só aparece no banco (a loja some da tela) e que a mais nova vence qualquer status.

### 2026-10-16 · F2 · sobras do CPF (99bb36f · d75be32)

- Saíram `lookupCep` (`cep-providers.ts`), `cep.ts`, `findCachedCep`/`saveCachedCep`, `supplierCoverage`, `cepCache` e as 7 colunas de endereço do `tenant_profile`; `stateSchema`/`BRAZILIAN_STATES` foram para `@sellbridge/shared/brazilian-states` (1 import trocado em `state-field.tsx`, `supplier-picker.tsx` e `fornecedores/index.tsx`). O `resolveCep` já não existia.
- Migration 0034 (`DROP` das 2 tabelas e das 7 colunas; o endereço antigo é apagado de vez). Teste novo `M1: the region leftovers…`; antes falhava com as 9 sobras.
- M1 ✅; M2 ✅ (banco na 0033 com cobertura, cache e perfil com endereço + CPF; depois da 0034 o titular e o fornecedor inicial ficam); M3 ✅. Revisão independente sem achado. C5 1546 (a contagem caiu 12 com os testes do código apagado; 1581 depois da junção).

### 2026-10-16 · 32.a · alertas de erro (d145480)

- `setErrorLogListener` no `logger` (só nível error, linha já redigida) e `installErrorAlerts` em `shared/runtime/error-alerts.ts`, ligados no web (`lib/server/environment.ts`) e no worker. `ALERT_WEBHOOK_URL` só HTTPS, desligado sem valor. 1 alerta por evento a cada 5 min, 1900 caracteres, timeout 3 s, sem retry, falha vira `warn`.
- 8 testes novos; antes 5 falhavam por asserção (`expected "vi.fn()" to be called 1 times, but got 0 times`).

### 2026-10-16 · 32.d · health do Redis (895984b)

- `runHealthChecks` em `shared/runtime/health.ts` (prazo de 2 s por checagem; crítica falhando = 503 e log `error`; não crítica = 200 `degraded` e `warn`). Worker: worker e Redis críticos; o servidor de health sobe antes dos schedulers (com Redis fora eles travavam e o probe não respondia). Web: Postgres crítico, Redis não.
- Achado no teste real: `runCommand("PING")` da BullMQ 6 falha (`client[name] is not a function`); o certo é `"ping"`. O teste do `pingQueueConnection` imita o despacho e falha com `"PING"`.
- Verificado com o worker de verdade: Redis no ar → 200 `{worker: ok, redis: ok}`; porta morta → 503 `{redis: unavailable}`. A rota do web não foi aberta no navegador (sem `.env` para o preview); usa a mesma função testada.

### 2026-10-16 · 32.e · sync em paralelo por loja (06f90a7)

- Lote agrupado por loja; até 5 lojas ao mesmo tempo, cada loja em série (rate limit); prazo conferido por anúncio; loja sem token ou recusada pelo marketplace para no lote.
- Teste novo com 3 lojas; antes falhava com `expected …619 to be less than …367` (B só começava depois de A).

### 2026-10-16 · 32.b e 32.c · fase 2

- Só nota de deploy em `docs/deploy-infra.md`: backup agendado + `pg_dump`/`pg_restore` em banco novo, volume de uploads, e o desenho do adapter S3/R2.

### 2026-10-16 · F3 · seed mais completo (39ce5bb)

- `runSeed` (`seed/run.ts`, testável) chamado pelo `index.ts`; `customers.ts` (workspace do admin: "Vitrine SellBridge" com Curitiba Tech, ~420 pedidos; Bruno vendendo, Carla com loja `expired` para reconectar, Daniel parado no cadastro sem CPF); `support.ts` (7 chamados: open, answered e closed, as 4 prioridades e as categorias, com `awaitingSince`, `firstResponseAt`, responsável, `closedAt` e nota). `seedDemoSales` ganhou o parâmetro `stores`. A conta demo é semeada antes das outras para tirar os mesmos números aleatórios de antes (pedidos iguais). `--reset` apaga também os clientes.
- Teste novo `seed.test.ts` (banco descartável, roda o seed duas vezes); antes falhava com `expected 0 to be greater than or equal to 1` (admin sem loja), `conta bruno@sellbridge.local não criada` e `expected Set{} to deeply equal Set{ 'open', 'answered', 'closed' }`.
- C7 da área (specs que entram como admin, 10 arquivos): 20/24 na primeira rodada; as 4 falhas eram do ambiente sem `.env` (`MOCK_WEBHOOK_SECRET` e `ADMIN_EMAILS` ausentes: sem "Conectar Loja simulada" nem "Dono da plataforma"); com as variáveis, 9/9 nos 4 specs. C1–C6 ✅, C5 1622/1622 (uma rodada anterior teve o timeout descrito em "Refinar depois").
- Seed aplicado no `sellbridge_desk_f`: admin 419 pedidos, 3 clientes, 7 chamados.
