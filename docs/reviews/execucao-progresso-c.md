# Andamento da execução tela a tela · chat paralelo C

Registro do chat paralelo C ([chat-paralelo-c.md](../prompts/chat-paralelo-c.md)), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md) só para os itens 08, 09, 10, 13, 14, 15, 16 e 18, no worktree `SellBridge-c` (branch `feat/client-phase-1-c`, banco `sellbridge_desk_c`). O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 08.a · Sync ignora inativos e fora da cobertura
- Última etapa concluída: 8 · Documentar (aguardando ⏸3)
- Próximo passo: etapa 9 · commit local após OK do ⏸3
- Arquivos tocados: ver `git status` (shared/domain/catalog-availability, sql/supplier-coverage, listings, suppliers, publish-listing, suppliers.server, region.functions, testes, docs)
- Decisões tomadas nos pontos de parada: ⏸1 aprovado (revendedor sem CEP conta como coberto; não mexer em customers.functions.ts por causa do chat B)
- Pendências: —

## Linha de base

| Métrica                                        | Valor                   | Medido em  |
| ---------------------------------------------- | ----------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 955 passando            | 2026-10-13 |
| Última migration                               | 0021_repair_public_api  | 2026-10-13 |
| Branch de trabalho                             | `feat/client-phase-1-c` | 2026-10-13 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit | Notas                               |
| ---- | ---------------------------------------------- | -------- | ------ | ----------------------------------- |
| 00   | Preparação do dia (chat C)                     | ✅       | —      | Linha de base 937 no banco C        |
| 08   | Produto ou fornecedor inativo e fora da região | 🟡       | —      | 08.a ✅ (commit pendente) · 08.b ⬜ |
| 09   | Lucro correto                                  | ⬜       | —      |                                     |
| 10   | Segurança de contas e da equipe                | ⬜       | —      |                                     |
| 13   | Erros de publicação claros                     | ⬜       | —      |                                     |
| 14   | Publicação em massa: validação e progresso     | ⬜       | —      |                                     |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —      |                                     |
| 16   | Riscos da assinatura                           | ⬜       | —      |                                     |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —      |                                     |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-13 · Item 08.a · Produto indisponível fora do marketplace — ✅ concluído (commit local)

- A sincronização manda estoque 0 (preço normal) para produto ou fornecedor inativo e para fornecedor que não cobre a região do dono do anúncio; revendedor sem CEP conta como coberto (⏸1). Regra em `shared/domain/catalog-availability.ts`; SQL em `repositories/sql/supplier-coverage.ts` (`coversRegion` saiu de `suppliers.ts`, `sellableOnMarketplace`).
- Publicação na fila de produto indisponível falha de vez, sem chamar o marketplace, com a frase do motivo. Salvar fornecedor, ativar/desativar produto ou fornecedor e trocar o CEP disparam a sincronização na hora.
- Portões: lint, tipos, formatação, sem else ✅; 955 testes (base 937); build ✅; e2e 18 (admin-suppliers, publishing, suppliers, stock) e 10 de novo após a revisão ✅. Sem tela alterada (D0–D4 não se aplicam).
- Teste antigo `admin-suppliers.test.ts` exigia estoque 30 para produto inativo (era o B9): agora exige 0. `migrations.test.ts` (M1/M2) ganhou limite de 30 s: estourava 5 s por 13 ms com os pacotes em paralelo.
- Revisão independente: 0 crítico/alto. Corrigidos: interruptores de ativo sem sincronização na hora; frase da falha prometia volta automática. Aceitos: corrida entre carregar e reivindicar a publicação (a próxima sincronização manda 0) e até 3 s a mais ao salvar o CEP.
- Pendência para a junção: a troca de região feita pelo admin (`customers.functions.ts`, item 12 do chat B) também deve chamar `requestStockSync`.

### 2026-10-13 · Item 00 · Preparação do dia (chat C) — ✅ concluído

- Branch `feat/client-phase-1-c` limpa em `a6af82e`; Postgres e Redis no ar; `sellbridge_desk_c` com 22 migrations (0000–0021) e semeado.
- Preview `sellbridge-c` na porta 3600 (o painel de preview lê o `.claude/launch.json` da pasta principal, então a entrada `sellbridge-c` foi acrescentada lá também, com `pnpm -C` apontando para este worktree; arquivo local, fora do git).
- C5 no banco C: 937 testes passando (shared 244, marketplaces 124, web 334, worker 45, database 183, outro pacote 7). É a linha de base deste chat.
