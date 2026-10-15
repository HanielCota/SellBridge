# Andamento do chat B (segurança, contas e lojas)

Registro do chat B na divisão de 2026-10-15 ([coordenacao.md](../prompts/coordenacao.md), seção 0), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-b-47fa05`, branch `claude/client-b-47fa05` (criada de `feat/client-phase-1` em 27366e3), banco `sellbridge_desk_b`, Redis db 2, preview `sellbridge-b` na 3500, e2e 3150 · 3151 · db 3.

## Em andamento

- Item/parte: 03 · Mesma conta do ML em dois revendedores (só servidor: ⏸1 e ⏸2 juntos)
- Última etapa concluída: 8 · Documentar (⏸1+⏸2 aprovado em 2026-10-14; ⏸3 aguardando OK)
- Próximo passo: depois do OK do ⏸3, commit local, `git merge feat/client-phase-1`, portões de novo e aviso ao principal
- Arquivos tocados: packages/database/src/repositories/stores.ts, stores.test.ts, webhooks.ts, packages/database/src/postgres-errors.ts (+ teste, novos), apps/web/src/features/stores/oauth.server.test.ts (novo), apps/worker/src/processors/webhook-event.test.ts, docs/decisions.md, docs/reviews/2026-10-12-lacunas-cliente.md, este arquivo
- Decisões tomadas nos pontos de parada: venda retida entra no dono atual da loja (aprovado no ⏸1+⏸2)
- Pendências: o banco `sellbridge_desk_b` já tem a 0024 da `wip/billing-holder` aplicada (`tenant_profile.full_name` e `cpf`, anuláveis; linha 25 em `drizzle.__drizzle_migrations`), embora a branch só vá até a 0023. Inofensivo para os testes; a próxima migration daqui precisa de `when` maior que 1792022885802 ou o Drizzle a pula neste banco

## Linha de base

| Métrica                                        | Valor                    | Medido em  |
| ---------------------------------------------- | ------------------------ | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1132 passando            | 2026-10-14 |
| Testes web (`apps/web` vitest)                 | 395 passando             | 2026-10-14 |
| Última migration (branch)                      | 0023_pending_indexes     | 2026-10-14 |
| Branch de trabalho                             | `claude/client-b-47fa05` | 2026-10-14 |

C5 no banco B: shared 298, marketplaces 149, web 395, worker 55, database 228, scripts 7 (base de partida 1125).

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                                 | Situação | Commit | Notas                                        |
| ---- | -------------------------------------- | -------- | ------ | -------------------------------------------- |
| 03   | Mesma conta do ML em dois revendedores | ⬜       | —      | Em andamento (⏸1+⏸2)                         |
| 10   | Segurança de contas e da equipe        | ⬜       | —      | Partes a, b, c; revisão independente em cada |
| 11   | Uploads seguros                        | ⬜       | —      |                                              |
| 12   | Admin muda a região e apaga o endereço | ⬜       | —      |                                              |
| 17   | Link do fornecedor e diagnóstico       | ⬜       | —      |                                              |
| 19   | Pequenos de segurança e status         | ⬜       | —      |                                              |
| 24   | Saúde das lojas                        | ⬜       | —      |                                              |
| 30   | LGPD e proteção da conta               | ⬜       | —      | Partes a, b                                  |

Correções de design da auditoria que ficam com o B (coordenacao, seção 1): X-7 (anel de foco) e X-8 (contraste), junto com o item que mexer na tela.

## Histórico

### 2026-10-14 · Item 03 · Mesma conta do ML em dois revendedores — aguardando ⏸3

- A recusa entre organizações, o índice único (0023), a mensagem na tela e o webhook determinístico já existiam. Faltava a corrida: duas organizações conectando a mesma loja ao mesmo tempo passavam pela checagem e a perdedora recebia o erro cru do índice ("Não foi possível conectar a loja"). Agora vira o mesmo conflito, com a mesma mensagem (`isUniqueViolation` em `packages/database/src/postgres-errors.ts`).
- Testes: corrida com a linha rival não confirmada (falhava antes), callback OAuth (tenant da sessão, `shop_in_use`, state de outro tenant), venda de loja que mudou de dono vai ao dono atual, auxiliar de erro do Postgres.
- Portões: C1–C4 ✅, C5 1132/1132 (base 1125), C6 ✅ sem mudança no `routeTree.gen.ts`, C7 11/11 (stores-messages, publishing). Sem migration, sem tela.
- Fora do escopo: a 0023 cria o índice único sem tirar duplicados antes; um banco com a mesma loja viva em dois tenants não migra (dono: principal).

### 2026-10-14 · Configuração do chat B

- `.env` da worktree a partir do da pasta principal, com banco, Redis, URLs e portas do B; `pnpm install --frozen-lockfile`; migrate no `sellbridge_desk_b` sem nada a aplicar (seed já presente: admin e demo).
- Entrada `sellbridge-b` apontando para esta worktree no `.claude/launch.json` **da worktree** (o hook da sessão não deixa editar o `.claude/` da pasta principal a partir de uma worktree; lá a entrada antiga aponta para `SellBridge-b`).
- C5: 1125/1125.
