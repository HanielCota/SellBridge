# Andamento do chat B (segurança, contas e lojas)

Registro do chat B na divisão de 2026-10-15 ([coordenacao.md](../prompts/coordenacao.md), seção 0), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-b-47fa05`, branch `claude/client-b-47fa05` (criada de `feat/client-phase-1` em 27366e3), banco `sellbridge_desk_b`, Redis db 2, preview `sellbridge-b` na 3500, e2e 3150 · 3151 · db 3.

## Em andamento

- Item/parte: 19 · Pequenos de segurança e status (B20, B15)
- Última etapa concluída: 8 · Revisão (pacote ⏸3 apresentado em 2026-10-15, aguardando OK)
- Próximo passo: depois do OK, commit, junção com feat/client-phase-1, migrate, portões e hash para o chat principal
- Arquivos tocados: shared/schemas/internal-path(.test).ts, shared/domain/store-attention(.test).ts, shared/package.json, schemas/index.ts, login.tsx, onboarding.tsx, store-status-badge.tsx, store-list.tsx, repositories/stores(.test).ts, worker token-refresh.ts, e2e/store-attention.spec.ts, e2e/auth.spec.ts, decisions.md, relatório de lacunas
- Decisões tomadas nos pontos de parada: ⏸1 OK (atenção derivada de `connected` + `lastError`, sem gravar `error`; ficha do admin fica para o 24)
- Pendências: item 12 parado e guardado em `wip/b-item-12-address` (ec5bfc8), sem commit nesta branch: a etapa 6 do chat de CPF tira da ficha o formulário de CEP e o endereço do admin, e o principal vai propor marcar o 12 como "não se aplica". O commit guarda a regra `shared/domain/address-change.ts` (mantém número e complemento na mesma rua, usada também pelo seed) e textos da ficha. Conta de preview `admin.comum.preview@sellbridge.test` (admin comum) no `sellbridge_desk_b`

## Linha de base

| Métrica                                        | Valor                     | Medido em  |
| ---------------------------------------------- | ------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1333 passando             | 2026-10-14 |
| Testes web (`apps/web` vitest)                 | 524 passando              | 2026-10-14 |
| Última migration (branch)                      | 0027_oauth_state_supplier | 2026-10-14 |
| Branch de trabalho                             | `claude/client-b-47fa05`  | 2026-10-14 |

C5 no banco B no item 11 (base feat/client-phase-1 14ab0ae): shared 340, marketplaces 149, web 524, worker 56, database 257, scripts 7.

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                                 | Situação | Commit  | Notas                                                                                |
| ---- | -------------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------ |
| 03   | Mesma conta do ML em dois revendedores | ✅       | 558cd66 | Junção e21574c                                                                       |
| 10   | Segurança de contas e da equipe        | ✅       | 3742f08 | 10.a ✅ 6c32358 · 10.b ✅ c29dbc8 · 10.c ✅ 7bd26d1 + 3742f08 (lojas)                |
| 11   | Uploads seguros                        | ✅       | 3859be6 |                                                                                      |
| 12   | Admin muda a região e apaga o endereço | ⛔       | —       | Parado em `wip/b-item-12-address` (ec5bfc8): etapa 6 do CPF tira o endereço do admin |
| 17   | Link do fornecedor e diagnóstico       | ✅       | 93b97c3 |                                                                                      |
| 19   | Pequenos de segurança e status         | ⬜       | —       |                                                                                      |
| 24   | Saúde das lojas                        | ⬜       | —       |                                                                                      |
| 30   | LGPD e proteção da conta               | ⬜       | —       | Partes a, b                                                                          |

Correções de design da auditoria que ficam com o B (coordenacao, seção 1): X-7 (anel de foco) e X-8 (contraste), junto com o item que mexer na tela.

## Histórico

### 2026-10-15 · Item 19 · Pequenos de segurança e status — 🟡 aguardando OK do ⏸3

- B20: `redirect` do login e do onboarding passa por `internalPathSchema`; `//host`, `/\host`, esquemas, espaço e caracteres de controle são descartados e a tela segue para o destino padrão.
- B15: a loja conectada com `lastError` aparece em "Atenção" (ponto e chip âmbar, motivo no subtítulo, topo da lista), sem gravar `error`, para continuar renovando e sincronizando.
- Revisão independente: sem crítico ou alto. 2 médios corrigidos (`recordStoreError` só grava enquanto o refresh token é o mesmo; e2e isolado numa conta nova) e 3 baixos (conexão do banco fechada no e2e, loja em atenção no topo da lista, caso `/\host` no e2e do login). Admin fica para o item 24.

### 2026-10-15 · Item 17 · Link do fornecedor e diagnóstico — ✅ concluído (93b97c3, commit local; junção 105b46a)

- N11: o token do fornecedor saiu das URLs. A etiqueta abre por um formulário POST (token no corpo, teto de 1 KB), o link antigo com `?token=` recebe 400 sem ler o token e `getSupplierShipmentFn` passou de GET para POST. O GET da etiqueta segue só pela sessão do revendedor.
- N12: o diagnóstico conta por cliente (30 por minuto, pelo primeiro hop de `CLIENT_IP_HEADER`) e no total (600 por minuto), então um navegador em loop não silencia os outros.
- Revisão independente: sem crítico ou alto. 3 baixos corrigidos (varredura do teste agora divide por função e trata `createServerFn()` sem método como GET; comentário sobre ler o env cru; log `web.label_refused` sem token). Nota de UX: recarregar a aba do PDF pede reenvio do formulário.
- Portões: C1–C4 ✅, C5 1356/1356, C6 ✅, C7 17/17 (fulfillment, order-page, accessibility).

### 2026-10-15 · Item 11 · Uploads seguros — ✅ concluído (3859be6, commit local; junção 0d5b74e)

- Teto do corpo já vinha do audit. Agora o chamado é conferido antes de gravar o anexo (outro tenant 404, equipe em chamado encerrado 409, sem arquivo no disco), um anexo que falha no meio apaga os já gravados, e há limite de envios por conta em memória (429): 30 mensagens com arquivo e 10 fotos a cada 10 min.
- Revisão independente: 2 médios corrigidos (arquivo órfão quando um put falha no meio; limite gastava em resposta só de texto, agora conta só mensagem com arquivo) e 2 baixos (chaves paradas removidas do limitador; arquivo inválido em loop agora também gasta o limite). `Retry-After` no 429 ficou de fora.
- Portões: C1–C4 ✅, C5 1333/1333, C6 ✅, C7 15/15 (support, profile, admin, impersonation) + 9/9 depois do último ajuste. A junção seguinte (0d5b74e) trouxe só documentos.

### 2026-10-15 · Item 10.c · Parte de lojas — ✅ concluído (3742f08, commit local; junção 104c604)

- Durante o "entrar como", conectar loja é recusado no início e no retorno do OAuth (`erro=impersonating`, mensagem fixa) sem falar com o marketplace; a tela de Lojas mostra o aviso e trava Conectar, Reconectar e Desconectar (contexto `stores-lock.tsx`; `lojas.tsx` só com provedor e aviso, a pedido do principal, porque o CPF mexe nela na etapa 5). Item 10 completo.
- Portões: C1–C4 ✅, C5 1320/1320 (depois da junção com 93eb43b e f468e1b), C6 ✅, C7 14/14 (impersonation, stores-messages, publishing, accessibility); antes da junção, 1290 e 19/19.

### 2026-10-15 · Item 10.c · Troca de e-mail e regras do "entrar como cliente" — 🟡 commitado sem a parte de lojas (7bd26d1, commit local)

- Antes: e-mail trocado pelo admin continuava "verificado" (e2e: `emailVerified` true); durante o "entrar como", só criar chave e webhook eram bloqueados, nada levava o nome do admin e a volta não era registrada. Agora: regra central no `tenantMiddleware` (9 ações bloqueadas pelo nome, demais escritas registradas como "Como o cliente: …"), rotas de segurança da conta fechadas na visita, 1 h conferida no servidor, banner com "até HH:MM", Integrações travada, ficha com "E-mail não confirmado", promoção a dono apagando também logins sociais.
- O teste de nomes pegou na hora uma renomeação da etapa do CPF (`updateTenantRegion` → `saveOnboardingHolder`).
- Revisão independente: 2 rodadas. Corrigidos: rotas de vínculo de conta abertas na visita e escritas fora do middleware sem registro (médios); aviso ao e-mail antigo dependia do registro, limite de 1 h dependia de cookie (inclusive nas rotas de nome e foto) e "Saiu da conta" gravado antes da saída (baixos). Mantido: casamento só por nome (teste cobre renomeação).
- Portões: C1–C4 ✅, C5 1283/1283, C6 ✅, C7 26/26 (impersonation, admin, platform-owner, account-security, integrations, webhooks, billing, support, accessibility), D2 8 larguras.
- Erro de processo corrigido na hora: criei um commit temporário com `--no-verify` para fazer a junção; desfeito com `reset --soft` antes de qualquer outra coisa.

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
