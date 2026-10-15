# Andamento do chat B (segurança, contas e lojas)

Registro do chat B na divisão de 2026-10-15 ([coordenacao.md](../prompts/coordenacao.md), seção 0), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-b-47fa05`, branch `claude/client-b-47fa05` (criada de `feat/client-phase-1` em 27366e3), banco `sellbridge_desk_b`, Redis db 2, preview `sellbridge-b` na 3500, e2e 3150 · 3151 · db 3.

## Em andamento

- Item/parte: 10.c · Troca de e-mail com nova verificação e regras do "entrar como cliente" (com tela: 3 paradas)
- Última etapa concluída: 3 · Planejar (⏸1 apresentado em 2026-10-14, aguardando OK)
- Próximo passo: depois do OK, etapa 4 (testes que falham)
- Arquivos tocados: nenhum ainda (branch em 1a73d9b, juntada com feat/client-phase-1)
- Decisões tomadas nos pontos de parada: —
- Pendências: conta de preview `admin.comum.preview@sellbridge.test` (admin comum) no `sellbridge_desk_b`. Ordem combinada com o principal (2026-10-15): a etapa 4 do chat de CPF vai primeiro em `features/stores/oauth.server.ts` (+test), `store-connect-errors.ts`, `components/stores/store-list.tsx`, `add-store.tsx` e `routes/_app/lojas.tsx`; o 10.c faz todo o resto e aplica a parte de lojas (código `impersonating` no OAuth e botões desativados) por cima, depois da junção da etapa 4. O nome `disconnectStoreFn` não muda. No próximo merge, rodar o migrate (0026)

## Linha de base

| Métrica                                        | Valor                              | Medido em  |
| ---------------------------------------------- | ---------------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1213 passando                      | 2026-10-14 |
| Testes web (`apps/web` vitest)                 | 448 passando                       | 2026-10-14 |
| Última migration (branch)                      | 0025_store_supplier_and_unique_cpf | 2026-10-14 |
| Branch de trabalho                             | `claude/client-b-47fa05`           | 2026-10-14 |

C5 no banco B depois da junção com `feat/client-phase-1` (b387940) e do 10.b: shared 317, marketplaces 149, web 448, worker 55, database 237, scripts 7.

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                                 | Situação | Commit  | Notas                                       |
| ---- | -------------------------------------- | -------- | ------- | ------------------------------------------- |
| 03   | Mesma conta do ML em dois revendedores | ✅       | 558cd66 | Junção e21574c                              |
| 10   | Segurança de contas e da equipe        | 🟡       | 6c32358 | 10.a ✅ 6c32358 · 10.b ✅ c29dbc8 · 10.c ⬜ |
| 11   | Uploads seguros                        | ⬜       | —       |                                             |
| 12   | Admin muda a região e apaga o endereço | ⬜       | —       |                                             |
| 17   | Link do fornecedor e diagnóstico       | ⬜       | —       |                                             |
| 19   | Pequenos de segurança e status         | ⬜       | —       |                                             |
| 24   | Saúde das lojas                        | ⬜       | —       |                                             |
| 30   | LGPD e proteção da conta               | ⬜       | —       | Partes a, b                                 |

Correções de design da auditoria que ficam com o B (coordenacao, seção 1): X-7 (anel de foco) e X-8 (contraste), junto com o item que mexer na tela.

## Histórico

### 2026-10-14 · Item 10.b · Rotas cruas do plugin admin e organização — ✅ concluído (c29dbc8, commit local; branch já em dia com feat/client-phase-1 b387940)

- Organização (criar, apagar, convidar) e a checagem de membro em `requireTenantSession` já estavam prontas (audit). Faltava o plugin admin: qualquer admin, inclusive o dono, trocava a senha de um revendedor, apagava a conta, criava contas e listava todas pelas rotas cruas, sem registro (e2e: 200 nas quatro). Agora `/api/auth/admin/*` responde 404 ao navegador, menos entrar e sair como cliente; rota nova do plugin nasce fechada.
- Revisão independente: nenhum achado alto ou médio; 2 baixos atendidos (comentário no `authClient` sobre as rotas fechadas; e2e de "entrar como" uma atendente com 403, para seguir exercitando a trava do 10.a por HTTP).
- Portões: C1–C4 ✅, C5 1213/1213 (1194 da pasta principal depois da junção b387940 + 19 novos), C6 ✅, C7 11/11 (account-security, platform-owner, admin, accessibility) + platform-owner de novo depois do ajuste.
- Fora do escopo: `tenant-session.ts:41-45` usa `.catch` encadeado (regra da casa).

### 2026-10-14 · Item 10.a · Owner da plataforma e proteções — ✅ concluído (6c32358, commit local; junção ece12e6)

- Antes: o cargo `admin` recebia todos os poderes do plugin e qualquer admin trocava a senha, bloqueava, rebaixava ou removia um owner pelas rotas cruas `/api/auth/admin/*` (o e2e mostrou `set-role` no owner com 200). Agora uma trava no hook do Better Auth confere a conta antes e depois de cada ação (inclui criar conta, dar papel da equipe e trocar e-mail para o de um owner) e recusa o corpo que não consegue ler, a menos que seja owner.
- Ficha do cliente: selo "Dono da plataforma"; perfil, acesso, papel e "Entrar como cliente" travados com o motivo para quem não pode agir.
- Revisão independente: 3 rodadas. Corrigidos: `create-user` fora da trava (alto), trava sem olhar o estado novo no `update-user` (alto), e-mail em lista passando pelo schema (alto), admin comum dando papel da equipe (médio), papéis em lista ("user,admin"), botão de entrar ativo e textos na própria conta (baixos). Fora do escopo: lista e resumo rápido (servidor recusa). Reforço em `promoteVerifiedAdmin` fica para o 10.c.
- Portões: C1–C4 ✅, C5 1193/1193 (base 1147), C6 ✅, C7 8/8 (platform-owner, admin, accessibility), D2 8 larguras sem rolagem. Depois da junção (0025 aplicada no banco B): C1–C6 ✅, C5 1206/1206, C7 10/10 (com stores-messages).

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
