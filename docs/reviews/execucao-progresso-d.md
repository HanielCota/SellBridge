# Andamento do chat D (conta, planos e painel)

Registro do chat D na divisão de 2026-10-16 ([coordenacao.md](../prompts/coordenacao.md), seção 0, Modo MVP), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-d-a03fb7`, branch `claude/client-d-a03fb7` (criada de `feat/client-phase-1` em 79c5769), banco `sellbridge_desk_d` (recriado do zero em 2026-10-16, 32 migrations até a 0031, seed completo), Redis db 6, preview na 3700, e2e 3170 · 3171 · db 7.

## Em andamento

- Item/parte: 26.c
- Última etapa concluída: 16.b commitado (item 16 fechado, ⏸B enviado)
- Próximo passo: 26.c (porcentagem e tempo estimado do onboarding)
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: ⏸A aprovado em 2026-10-16 como proposto: cota por loja de destino (registrar como D10), carência padrão de 7 dias, aceite de termos cobrado também dos usuários atuais; ordem 16.a → 16.b → 26.c → 26.b → 26.a → 31.a
- Pendências: —

## Linha de base

| Métrica                   | Valor                    | Medido em  |
| ------------------------- | ------------------------ | ---------- |
| Última migration (branch) | 0031_boundary_checks     | 2026-10-16 |
| Branch de trabalho        | `claude/client-d-a03fb7` | 2026-10-16 |
| Testes (`pnpm test`)      | 1573 passando            | 2026-10-16 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado · ⏭ fase 2

| Item | Título                                 | Situação | Commit           | Notas                                                          |
| ---- | -------------------------------------- | -------- | ---------------- | -------------------------------------------------------------- |
| 16   | Riscos da assinatura                   | ✅       | 00e4199 · (16.b) | 16.a ✅ 00e4199 · 16.b ✅                                      |
| 26   | Onboarding previsível e conta completa | ⬜       | —                | 26.a ⬜ · 26.b ⬜ · 26.c ⬜                                    |
| 31   | Planos como no PDF                     | ⬜       | —                | 31.a ⬜ (flag desligada, D10) · 31.b ⏭ fase 2                  |
| 29   | Painel do mockup do cliente            | ⏭        | —                | D8 não registrada em `docs/decisions.md` em 2026-10-16: fase 2 |

## Refinar depois

- Painel "Precisa de você" mostra "Tudo em dia" enquanto as consultas carregam (já era assim; entra com o U-2, skeletons).
- Assinatura cancelada pelo Stripe depois das tentativas de cobrança não ganha aviso (`billingNotice` cobre `past_due` e `unpaid`).
- Aviso de pagamento aparece também para membros que não são o proprietário (só o proprietário pode pagar).
- `billing_accounts.last_event_created` guarda, desde o 16.a, a hora da leitura no Stripe em ms; renomear a coluna (`last_observed_at`) numa migration de limpeza.

## Histórico

### 2026-10-16 · Item 16 · Riscos da assinatura — ✅ concluído (commits locais)

- 16.a (00e4199): checkout sem trava de linha (customer fora de transação, trava consultiva por organização, 409 no segundo clique); webhook lê o Stripe antes da transação, vale a leitura mais recente (`observedAt` em ms); limites de 5 s / 1 retentativa.
- 16.b: cota por publicação viva por loja de destino (inclui lojas desconectadas; "Reprocessar" pede vaga); produção sem Stripe não inicia sem `BILLING_UNLIMITED=true`; carência `BILLING_PAST_DUE_GRACE_DAYS` (7) gravada em `period_end`; aviso no painel e em `/assinatura`.
- Revisão independente: 4 achados reais corrigidos (Reprocessar sem cota, vagas liberadas ao desconectar, `observedAt` depois da leitura, portal e expiração sem limite) e trava consultiva com duas chaves; 3 menores em "Refinar depois".
- Portões: C1–C6 ✅, 1573 testes (shared 442, marketplaces 186, database 283, web 585, worker 77); C7 billing, reports, publishing, store-attention e accessibility 23/23; D2 0 px em 375/768/1440 no painel e em `/assinatura`.
