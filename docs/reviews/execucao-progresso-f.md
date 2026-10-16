# Andamento do Chat F (infra, só servidor, Modo MVP)

Branch `claude/client-f-326676` · banco `sellbridge_desk_f` · Redis db 10 · preview 3900 · e2e 3190 · 3191 · db 11.

## Em andamento

- ⏸A aprovado em 2026-10-16 (alertas por webhook). F1 fechado; próximo: F2.

## Ambiente

- 2026-10-16: banco `sellbridge_desk_f` criado, migrate (até 0032) e seed ok.
- O `.env` da worktree não foi criado: as regras de permissão do projeto negam ler ou gravar `.env`. Os comandos rodam com as variáveis exportadas por um script fora do repositório (scratchpad da sessão), com segredos de desenvolvimento gerados na hora.

## Fila

| Item | Título                                       | Situação | Commit  | Notas                          |
| ---- | -------------------------------------------- | -------- | ------- | ------------------------------ |
| F1   | Limpeza da loja viva duplicada antes da 0023 | ✅       | e2061f0 | nota em `docs/deploy-infra.md` |
| F2   | Remover o que o CPF deixou sem uso           | ⬜       |         | migration com senha da vez     |
| 32.a | Alertas de erro                              | ⬜       |         |                                |
| 32.d | Health do Redis                              | ⬜       |         |                                |
| 32.e | Sync em paralelo por loja                    | ⬜       |         |                                |
| 32.b | Backup e restore                             | ⬜       |         | fase 2: só nota de deploy      |
| 32.c | Adapter S3/R2                                | ⬜       |         | fase 2: só nota de deploy      |
| F3   | Seed mais completo                           | ⬜       |         |                                |

## Refinar depois

## Histórico

### 2026-10-16 · F1 · limpeza da loja viva duplicada antes da 0023 (e2061f0)

- A 0023 ganhou um `UPDATE` antes de `store_connections_live_shop_idx`: fica viva a conexão mais recente (`connected_at`, `id`); as outras viram `disconnected`, sem tokens, com `last_error`. O Drizzle só compara o `when` (`pg-core/dialect.js:56-69`), então quem já aplicou a 0023 não roda de novo.
- Teste novo `M2: 0023 keeps one live connection per shop…` (`migrations.test.ts`); antes falhava com `23505 could not create unique index "store_connections_live_shop_idx"`.
- Portões: C1–C4 ✅; C5 1558/1558 (shared 438, marketplaces 186, database 277, web 573, worker 77, raiz 7); C6 ✅; M1 ✅ (teste M1), M2 ✅ (teste novo, conferido o efeito nas 3 linhas), M3 n/a (sem entrada nova no journal).
- Revisão independente: sem bug real. Acatados: limpar tokens como o `disconnectStore`; a nota diz que o `last_error` só aparece no banco (a loja some da tela) e que a mais nova vence qualquer status.
