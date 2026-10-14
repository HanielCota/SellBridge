# Andamento da execução tela a tela · chat paralelo C

Registro do chat paralelo C ([chat-paralelo-c.md](../prompts/chat-paralelo-c.md)), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md) só para os itens 08, 09, 10, 13, 14, 15, 16 e 18, no worktree `SellBridge-c` (branch `feat/client-phase-1-c`, banco `sellbridge_desk_c`). O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 08.b · Desativar pausa, sincroniza, notifica, audita e tem e2e
- Última etapa concluída: auditoria e remoção dos vícios de IA (aguardando OK do commit)
- Próximo passo: commit `refactor: remove AI vices`; depois 08.b etapa 1
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: usuário aprovou o ⏸3 do 08.a
- Pendências: troca de região pelo admin (customers.functions.ts, chat B) deve chamar requestStockSync na junção

## Linha de base

| Métrica                                        | Valor                   | Medido em  |
| ---------------------------------------------- | ----------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 959 passando            | 2026-10-13 |
| E2E completo (`--workers=1`, porta 3160)       | 63 passando             | 2026-10-13 |
| Última migration                               | 0021_repair_public_api  | 2026-10-13 |
| Branch de trabalho                             | `feat/client-phase-1-c` | 2026-10-13 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit | Notas                        |
| ---- | ---------------------------------------------- | -------- | ------ | ---------------------------- |
| 00   | Preparação do dia (chat C)                     | ✅       | —      | Linha de base 937 no banco C |
| 08   | Produto ou fornecedor inativo e fora da região | 🟡       | —      | 08.a ✅ b2a3331 · 08.b ⬜    |
| 09   | Lucro correto                                  | ⬜       | —      |                              |
| 10   | Segurança de contas e da equipe                | ⬜       | —      |                              |
| 13   | Erros de publicação claros                     | ⬜       | —      |                              |
| 14   | Publicação em massa: validação e progresso     | ⬜       | —      |                              |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —      |                              |
| 16   | Riscos da assinatura                           | ⬜       | —      |                              |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —      |                              |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-13 · Auditoria e remoção dos vícios de IA — ✅ (commit local)

- Pedido do usuário antes do item 09: auditoria do projeto inteiro (vícios de IA, design, interface, experiência) em `docs/reviews/2026-10-13-auditoria-ia-design-ux.md`; correção só dos vícios de IA, no projeto inteiro e em commit próprio (escolha do usuário).
- Pacotes e worker: opções de fila e `releaseFinishedJob` compartilhados; `userMessageOr`; `Transaction`, `timestampOf`, `sqlIntegerSchema`, `DAY_MILLISECONDS`/`daysBefore`, `stripAccents` e esquemas de ambiente em um lugar só; `issueSupplierLink`; `JobContext`; `scheduleRecurring` com limpeza de jobs nos 6 agendamentos; código morto removido (`listCustomers`, `assertCanRetryTarget`, barrel do shared, export `marketplaces/http`); "tenant" virou "conta" nas mensagens; motivo de falha da sincronização em português.
- Web: `copyToClipboard`, `initials`, `formatPercent`, `brazilDayKey`/`nearDayName`, `isShippingBlocked`; `ConfirmDialog` em desconectar loja; 9 arquivos mortos e tokens `--sidebar-*` removidos; "..." → "…" em 47 textos; "dashboard" → "painel" e "Status" → "Situação" na assinatura; `shadcn` e `tw-animate-css` em devDependencies.
- Não feito: hook único de filtros na URL (exigiria casts inseguros); regra "cancelado não conta" fica para o item 09; telas e design ficam para depois (lista na auditoria).
- Revisão independente: 0 crítico/alto. Corrigidos: data do fim do período voltou a ser absoluta no fuso de São Paulo; descriptografia do token do webhook voltou para dentro do bloco que registra a falha no evento; expressão de acentos com escapes; fuso do chamado compartilhado.
- Ambiente: o `playwright.config.ts` tinha porta 3100 e Redis db 1 fixos e ignorava o `.env` deste worktree. Trazido o commit do chat B (`bd13085`, cópia de `57706a5`) e corrigido o `profile.spec.ts` (porta 3100 fixa). **Os e2e do 08.a podem ter rodado no servidor do chat principal**; a suíte completa agora, isolada na 3160, passou 63/63 com o código do 08.a.
- Portões: lint, tipos, formatação, sem else ✅; 959 testes (base 955); build ✅; e2e completo 63/63.

### 2026-10-13 · Item 08.a · Produto indisponível fora do marketplace — ✅ concluído (b2a3331, commit local)

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
