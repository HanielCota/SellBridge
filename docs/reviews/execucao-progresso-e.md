# Andamento do chat E (admin da plataforma, suporte e avisos)

Registro do chat E na divisão de 2026-10-16 ([coordenacao.md](../prompts/coordenacao.md), seção 0, Modo MVP), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-e-8848ce`, branch `claude/client-e-8848ce` (criada de `feat/client-phase-1` em 79c5769), banco `sellbridge_desk_e`, Redis db 8, preview na 3800, e2e 3180 · 3181 · db 9.

## Em andamento

- Item/parte: — (fila do corte de sábado fechada: 25, 27.a, 27.c, 28.a; 28.b passou ao chat F)
- Última etapa concluída: 28.a commitado com as correções da revisão (aad94e8), junção 38333ee
- Próximo passo: — (esperar o principal juntar; nada pendente aqui)
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: ⏸A aprovado em 2026-10-16 com as três escolhas; corte de sábado (coordenacao 0.0, 4273792): fila 27.c, 28.a, 28.b, sem ⏸B; 27.b, 28.c e 28.d para a fase 2; 28.b passado ao chat F (b3a5455)
- Pendências: o `.env` da worktree não pôde ser criado (regra de permissão bloqueia escrever `.env`); comandos rodam com as variáveis do banco E na linha de comando

## Linha de base

| Métrica                                        | Valor                      | Medido em  |
| ---------------------------------------------- | -------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1618 passando              | 2026-10-16 |
| Última migration (branch)                      | 0034_drop_region_leftovers | 2026-10-16 |
| Branch de trabalho                             | `claude/client-e-8848ce`   | 2026-10-16 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado

| Item | Título                  | Situação | Commit                                          | Notas                                                                                                             |
| ---- | ----------------------- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 25   | Central de notificações | ✅       | 4c6b081 · 516a5ca · 5a21606 · 7780e5b · 4a7e3e2 | 25.a ✅ 516a5ca (migration 4c6b081) · 25.b ✅ 5a21606 · 25.c ✅ 7780e5b · 25.d ✅ 4a7e3e2; WhatsApp é fase 2 (D9) |
| 27   | Suporte: o que falta    | 🟡       | 5620cf6 · e006a06 · b8f37c6                     | 27.a ✅ e006a06 (migration 5620cf6) · 27.b ⏭ fase 2 (corte de sábado) · 27.c ✅ b8f37c6; 27.d e 27.e são fase 2   |
| 28   | Admin da plataforma     | 🟡       | ca7ddbb · aad94e8 · 835bb98                     | 28.a ✅ ca7ddbb + aad94e8 · 28.b → chat F (só a migration 835bb98 foi feita aqui) · 28.c e 28.d fase 2            |

Correções de design da auditoria que ficam com o E: U-7 ✅ (`BackLink` no `PageHeader`, e006a06) e U-10 (Métricas do suporte, ia com o 28.c: fase 2).

## Refinar depois

Acabamento que o Modo MVP deixa para depois (não bloqueia o item):

- Push: escolher provedor (Web Push ou FCM) e mostrar a coluna "Celular" em Perfil › Notificações (25).
- Limpar entregas antigas de `notification_deliveries` (enviadas há mais de 30 dias), como o `pruneApiEvents` faz (25).
- Um "Ativar tudo / desativar tudo" por canal em Perfil › Notificações (25).
- Preferência da equipe para o aviso de chamado novo (hoje sempre por e-mail; a tela de Perfil só mostra os avisos do revendedor) (27.c).
- `tickets.response_due_at` (0035) fica sem uso até o 27.b (horário comercial) na fase 2; os chamados antigos já têm o prazo preenchido.
- Link do convite da equipe vale 1 hora (o mesmo de redefinir senha); um prazo próprio maior para convites (28.a).
- Convidado nasce com uma organização vazia (hook do Better Auth); tirar a equipe das listas de clientes, se aparecer (28.a).
- `.env` da worktree: a regra de permissão bloqueia; portões e e2e rodam com o `.env` principal carregado no shell.

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima.

### 2026-10-16 · Itens 27 e 28 (corte de sábado) — 27.a ✅ · 27.c ✅ · 28.a ✅ · 28.b → chat F

- 27.a: migration 0035 (5620cf6) com `store_connection_id`, `listing_id` e `response_due_at` em `tickets`; "Falar com o suporte" no pedido, no menu da loja e do anúncio abre o chamado já ligado, e o servidor confere cada id contra a conta antes de salvar (`ticket-subjects.ts`); seção "Sobre" no painel do chamado (lojista e equipe); U-7 com `BackLink` no `PageHeader` (e006a06). e2e novo `support-links.spec.ts` 2/2.
- 27.c: chamado novo vai por e-mail para a equipe ativa pela fila do 25, sem a mensagem do lojista (b8f37c6).
- 28.a: Admin › Equipe com convite e cargo, só para dono da plataforma (ca7ddbb). A revisão independente achou um risco alto (convite para e-mail já cadastrado e não confirmado dava o cargo a quem registrou o endereço) e outros menores; corrigidos em aad94e8 com teste de regressão (domínio e e2e). e2e `team.spec.ts` 3/3 com axe; o e2e pegou o cargo ignorado pelo `createUser` (o hook cria sempre "user").
- 28.b: só a migration 0038 (835bb98) foi feita aqui; o resto passou ao chat F.
- Portões: C1–C6 verdes em cada parte; C5 final 1773 (shared 496, marketplaces 194, database 346, web 642, worker 88, scripts 7). Achado fora da área: `attention-panel.test.ts` falha no `pnpm test` sem `.env` na raiz (o turbo não repassa o ambiente).

### 2026-10-16 · Item 25 · Central de notificações — ✅ concluído (commits locais)

- 25.a: tabelas `notification_deliveries` e `notification_preferences` (0033, 4c6b081), fila com retentativa no padrão dos webhooks e canais e-mail (layout HTML) e push (stub) no worker (516a5ca).
- 25.b: catálogo de 6 eventos em `shared/domain/notification-events.ts`; venda paga e entregue saem de `recordOrderStatusChange`, loja expirada de `markStoreStatus`, erro de publicação de `markTargetFailed` final, atraso de uma varredura a cada 15 min (5a21606).
- 25.c: Perfil › Notificações com "No app" e "E-mail" por evento; o sino esconde o que foi desligado (7780e5b).
- 25.d: e-mail de resposta do suporte pela fila, em HTML, respeitando a preferência; `support-reply-email.ts` saiu (4a7e3e2).
- Portões: C1–C6 verdes em cada parte; C5 final 1618 (shared 461, marketplaces 186, database 300, web 585, worker 79, scripts 7); C7 profile 4/4, accessibility 2/2, support 6/6. D2 em /perfil: 0 px de rolagem em 375, 768 e 1440.
