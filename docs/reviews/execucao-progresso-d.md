# Andamento do chat D (conta, planos e painel)

Registro do chat D na divisão de 2026-10-16 ([coordenacao.md](../prompts/coordenacao.md), seção 0, Modo MVP), no formato de [execucao-progresso.md](execucao-progresso.md), que continua sendo do principal (só leitura aqui). Worktree `.claude/worktrees/client-d-a03fb7`, branch `claude/client-d-a03fb7` (criada de `feat/client-phase-1` em 79c5769), banco `sellbridge_desk_d` (recriado do zero em 2026-10-16, 32 migrations até a 0031, seed completo), Redis db 6, preview na 3700, e2e 3170 · 3171 · db 7.

## Em andamento

- Item/parte: 16.b
- Última etapa concluída: 16.a commitado
- Próximo passo: 16.b (cota por loja de destino, produção sem Stripe, carência do past_due)
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: ⏸A aprovado em 2026-10-16 como proposto: cota por loja de destino (registrar como D10), carência padrão de 7 dias, aceite de termos cobrado também dos usuários atuais; ordem 16.a → 16.b → 26.c → 26.b → 26.a → 31.a
- Pendências: —

## Linha de base

| Métrica                   | Valor                    | Medido em  |
| ------------------------- | ------------------------ | ---------- |
| Última migration (branch) | 0031_boundary_checks     | 2026-10-16 |
| Branch de trabalho        | `claude/client-d-a03fb7` | 2026-10-16 |
| Testes (`pnpm test`)      | 1555 passando            | 2026-10-16 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado · ⏭ fase 2

| Item | Título                                 | Situação | Commit | Notas                                                          |
| ---- | -------------------------------------- | -------- | ------ | -------------------------------------------------------------- |
| 16   | Riscos da assinatura                   | ⬜       | —      | 16.a ⬜ · 16.b ⬜                                              |
| 26   | Onboarding previsível e conta completa | ⬜       | —      | 26.a ⬜ · 26.b ⬜ · 26.c ⬜                                    |
| 31   | Planos como no PDF                     | ⬜       | —      | 31.a ⬜ (flag desligada, D10) · 31.b ⏭ fase 2                  |
| 29   | Painel do mockup do cliente            | ⏭        | —      | D8 não registrada em `docs/decisions.md` em 2026-10-16: fase 2 |

## Refinar depois

- `billing_accounts.last_event_created` guarda, desde o 16.a, a hora da leitura no Stripe em ms; renomear a coluna (`last_observed_at`) numa migration de limpeza.

## Histórico

_(nenhum item fechado ainda)_
