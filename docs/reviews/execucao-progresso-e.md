# Andamento do chat E (admin da plataforma, suporte e avisos)

Registro do chat E na divisão de 2026-10-16 ([coordenacao.md](../prompts/coordenacao.md), seção 0, Modo MVP), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-e-8848ce`, branch `claude/client-e-8848ce` (criada de `feat/client-phase-1` em 79c5769), banco `sellbridge_desk_e`, Redis db 8, preview na 3800, e2e 3180 · 3181 · db 9.

## Em andamento

- Item/parte: — (25 concluído, ⏸B enviado; próximo é o 27.a)
- Última etapa concluída: 25.d commitado (4a7e3e2)
- Próximo passo: 27.a (vínculo do chamado com loja e anúncio, botão "Falar com o suporte", U-7)
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: ⏸A aprovado em 2026-10-16 com as três escolhas (telefone vai para a fase 2 com a D9; plano só em conta sem assinatura; excluir conta de verdade)
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
| 27   | Suporte: o que falta    | ⬜       | —                                               | Partes a, b, c; 27.d e 27.e são fase 2                                                                            |
| 28   | Admin da plataforma     | ⬜       | —                                               | Partes a, b, c, d; inclui a auditoria do catálogo do 08.b                                                         |

Correções de design da auditoria que ficam com o E: U-7 ("Voltar" de detalhe e `PageHeader` com voltar) e U-10 (Métricas do suporte).

## Refinar depois

Acabamento que o Modo MVP deixa para depois (não bloqueia o item):

- Push: escolher provedor (Web Push ou FCM) e mostrar a coluna "Celular" em Perfil › Notificações (25).
- Limpar entregas antigas de `notification_deliveries` (enviadas há mais de 30 dias), como o `pruneApiEvents` faz (25).
- Um "Ativar tudo / desativar tudo" por canal em Perfil › Notificações (25).

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima.

### 2026-10-16 · Item 25 · Central de notificações — ✅ concluído (commits locais)

- 25.a: tabelas `notification_deliveries` e `notification_preferences` (0033, 4c6b081), fila com retentativa no padrão dos webhooks e canais e-mail (layout HTML) e push (stub) no worker (516a5ca).
- 25.b: catálogo de 6 eventos em `shared/domain/notification-events.ts`; venda paga e entregue saem de `recordOrderStatusChange`, loja expirada de `markStoreStatus`, erro de publicação de `markTargetFailed` final, atraso de uma varredura a cada 15 min (5a21606).
- 25.c: Perfil › Notificações com "No app" e "E-mail" por evento; o sino esconde o que foi desligado (7780e5b).
- 25.d: e-mail de resposta do suporte pela fila, em HTML, respeitando a preferência; `support-reply-email.ts` saiu (4a7e3e2).
- Portões: C1–C6 verdes em cada parte; C5 final 1618 (shared 461, marketplaces 186, database 300, web 585, worker 79, scripts 7); C7 profile 4/4, accessibility 2/2, support 6/6. D2 em /perfil: 0 px de rolagem em 375, 768 e 1440.
