# Andamento da execução tela a tela · chat paralelo C

Registro do chat paralelo C ([chat-paralelo-c.md](../prompts/chat-paralelo-c.md)), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md) só para os itens 08, 09, 10, 13, 14, 15, 16 e 18, no worktree `SellBridge-c` (branch `feat/client-phase-1-c`, banco `sellbridge_desk_c`). O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 08.a · Sync ignora inativos e fora da cobertura
- Última etapa concluída: — (00 ✅)
- Próximo passo: etapa 1 · ler o item 08 no prompt e o relatório de lacunas (B9, N10, B-10)
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: —
- Pendências: —

## Linha de base

| Métrica                                        | Valor                   | Medido em  |
| ---------------------------------------------- | ----------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 937 passando            | 2026-10-13 |
| Última migration                               | 0021_repair_public_api  | 2026-10-13 |
| Branch de trabalho                             | `feat/client-phase-1-c` | 2026-10-13 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit | Notas                        |
| ---- | ---------------------------------------------- | -------- | ------ | ---------------------------- |
| 00   | Preparação do dia (chat C)                     | ✅       | —      | Linha de base 937 no banco C |
| 08   | Produto ou fornecedor inativo e fora da região | ⬜       | —      |                              |
| 09   | Lucro correto                                  | ⬜       | —      |                              |
| 10   | Segurança de contas e da equipe                | ⬜       | —      |                              |
| 13   | Erros de publicação claros                     | ⬜       | —      |                              |
| 14   | Publicação em massa: validação e progresso     | ⬜       | —      |                              |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —      |                              |
| 16   | Riscos da assinatura                           | ⬜       | —      |                              |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —      |                              |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-13 · Item 00 · Preparação do dia (chat C) — ✅ concluído

- Branch `feat/client-phase-1-c` limpa em `a6af82e`; Postgres e Redis no ar; `sellbridge_desk_c` com 22 migrations (0000–0021) e semeado.
- Preview `sellbridge-c` na porta 3600 (o painel de preview lê o `.claude/launch.json` da pasta principal, então a entrada `sellbridge-c` foi acrescentada lá também, com `pnpm -C` apontando para este worktree; arquivo local, fora do git).
- C5 no banco C: 937 testes passando (shared 244, marketplaces 124, web 334, worker 45, database 183, outro pacote 7). É a linha de base deste chat.
