# Andamento do chat B (segurança, contas e lojas)

Registro do chat B na divisão de 2026-10-15 ([coordenacao.md](../prompts/coordenacao.md), seção 0), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-b-47fa05`, branch `claude/client-b-47fa05` (criada de `feat/client-phase-1` em 27366e3), banco `sellbridge_desk_b`, Redis db 2, preview `sellbridge-b` na 3500, e2e 3150 · 3151 · db 3.

## Em andamento

- Item/parte: 10.a · Owner da plataforma e proteções (com tela: 3 paradas)
- Última etapa concluída: 8 · Documentar (⏸2 aprovado em 2026-10-14; ⏸3 aguardando OK)
- Próximo passo: depois do OK, commit local, `git merge feat/client-phase-1`, portões de novo e aviso ao principal
- Arquivos tocados: packages/shared/src/domain/platform-owner(.test).ts, packages/shared/package.json, apps/web/src/lib/server/account-protection(.test).ts, auth.ts, tenant-session.ts, middleware.test.ts, apps/web/src/features/admin/customers.functions.ts, customer-ranking.test.ts, apps/web/src/components/admin/customer-access.tsx, customer-profile-form.tsx, apps/web/src/routes/_app/admin/clientes/$userId.tsx, packages/database/src/repositories/customers.ts, apps/web/e2e/platform-owner.spec.ts, docs/decisions.md, docs/reviews/2026-10-12-lacunas-cliente.md
- Decisões tomadas nos pontos de parada: owner exige e-mail verificado e papel admin; conta da equipe só é gerenciada por owner (⏸1)
- Pendências: a lista de clientes e o resumo rápido ainda mostram "Bloquear" e "Entrar como cliente" ativos para contas da equipe (o servidor recusa com a mensagem certa); ver item 28. Conta de preview `admin.comum.preview@sellbridge.test` (admin comum) no `sellbridge_desk_b`

## Linha de base

| Métrica                                        | Valor                      | Medido em  |
| ---------------------------------------------- | -------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1147 passando              | 2026-10-14 |
| Testes web (`apps/web` vitest)                 | 395 passando               | 2026-10-14 |
| Última migration (branch)                      | 0024_tenant_billing_holder | 2026-10-14 |
| Branch de trabalho                             | `claude/client-b-47fa05`   | 2026-10-14 |

C5 no banco B depois da junção com `feat/client-phase-1` (7b69fd2): shared 306, marketplaces 149, web 395, worker 55, database 235, scripts 7.

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                                 | Situação | Commit  | Notas                                        |
| ---- | -------------------------------------- | -------- | ------- | -------------------------------------------- |
| 03   | Mesma conta do ML em dois revendedores | ✅       | 558cd66 | Junção e21574c                               |
| 10   | Segurança de contas e da equipe        | ⬜       | —       | Partes a, b, c; revisão independente em cada |
| 11   | Uploads seguros                        | ⬜       | —       |                                              |
| 12   | Admin muda a região e apaga o endereço | ⬜       | —       |                                              |
| 17   | Link do fornecedor e diagnóstico       | ⬜       | —       |                                              |
| 19   | Pequenos de segurança e status         | ⬜       | —       |                                              |
| 24   | Saúde das lojas                        | ⬜       | —       |                                              |
| 30   | LGPD e proteção da conta               | ⬜       | —       | Partes a, b                                  |

Correções de design da auditoria que ficam com o B (coordenacao, seção 1): X-7 (anel de foco) e X-8 (contraste), junto com o item que mexer na tela.

## Histórico

### 2026-10-14 · Item 10.a · Owner da plataforma e proteções — aguardando ⏸3

- Antes: o cargo `admin` recebia todos os poderes do plugin e qualquer admin trocava a senha, bloqueava, rebaixava ou removia um owner pelas rotas cruas `/api/auth/admin/*` (o e2e mostrou `set-role` no owner com 200). Agora uma trava no hook do Better Auth confere a conta antes e depois de cada ação (inclui criar conta, dar papel da equipe e trocar e-mail para o de um owner) e recusa o corpo que não consegue ler, a menos que seja owner.
- Ficha do cliente: selo "Dono da plataforma"; perfil, acesso, papel e "Entrar como cliente" travados com o motivo para quem não pode agir.
- Revisão independente: 3 rodadas. Corrigidos: `create-user` fora da trava (alto), trava sem olhar o estado novo no `update-user` (alto), e-mail em lista passando pelo schema (alto), admin comum dando papel da equipe (médio), papéis em lista ("user,admin"), botão de entrar ativo e textos na própria conta (baixos). Fora do escopo: lista e resumo rápido (servidor recusa). Reforço em `promoteVerifiedAdmin` fica para o 10.c.
- Portões: C1–C4 ✅, C5 1193/1193 (base 1147), C6 ✅, C7 8/8 (platform-owner, admin, accessibility), D2 8 larguras sem rolagem.

### 2026-10-14 · Item 03 · Mesma conta do ML em dois revendedores — ✅ concluído (558cd66, commit local; junção e21574c)

- A recusa entre organizações, o índice único (0023), a mensagem na tela e o webhook determinístico já existiam. Faltava a corrida: duas organizações conectando a mesma loja ao mesmo tempo passavam pela checagem e a perdedora recebia o erro cru do índice ("Não foi possível conectar a loja"). Agora vira o mesmo conflito, com a mesma mensagem (`isUniqueViolation` em `packages/database/src/postgres-errors.ts`).
- Testes: corrida com a linha rival não confirmada (falhava antes), callback OAuth (tenant da sessão, `shop_in_use`, state de outro tenant), venda de loja que mudou de dono vai ao dono atual, auxiliar de erro do Postgres.
- Portões: C1–C4 ✅, C5 1132/1132 (base 1125), C6 ✅ sem mudança no `routeTree.gen.ts`, C7 11/11 (stores-messages, publishing). Sem migration, sem tela.
- Depois da junção (traz a 0024 do titular, já aplicada no banco B): C1–C4 ✅, C5 1147/1147, C6 ✅.
- Fora do escopo: a 0023 cria o índice único sem tirar duplicados antes; um banco com a mesma loja viva em dois tenants não migra (dono: principal).

### 2026-10-14 · Configuração do chat B

- `.env` da worktree a partir do da pasta principal, com banco, Redis, URLs e portas do B; `pnpm install --frozen-lockfile`; migrate no `sellbridge_desk_b` sem nada a aplicar (seed já presente: admin e demo).
- Entrada `sellbridge-b` apontando para esta worktree no `.claude/launch.json` **da worktree** (o hook da sessão não deixa editar o `.claude/` da pasta principal a partir de uma worktree; lá a entrada antiga aponta para `SellBridge-b`).
- C5: 1125/1125.
