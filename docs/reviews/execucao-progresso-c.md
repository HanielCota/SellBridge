# Andamento da execução tela a tela · chat paralelo C

Registro do chat C ([coordenacao.md](../prompts/coordenacao.md), seção 0: catálogo, publicação e dinheiro), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md). Desde 2026-10-15 roda na worktree `.claude/worktrees/client-c-52dc32` (branch `claude/client-c-52dc32`, criada de `feat/client-phase-1` em `27366e3`), banco `sellbridge_desk_c`, Redis db 4, preview `sellbridge-c` na 3600 e e2e na 3160 · 3161 · db 5. O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 09.c · Custo pendente nas telas
- Última etapa concluída: 8 · Documentar (⏸3 aguardando OK, 2026-10-15); ⏸1 e ⏸2 aprovados em 2026-10-15
- Próximo passo: depois do OK, commit local da 09.c, `git merge feat/client-phase-1` (traz a migration 0025: rodar o migrate no `sellbridge_desk_c`), portões de novo e aviso ao principal com a branch e os hashes; depois o item 15
- Arquivos tocados: web/features/reports/chart-view(.test).ts, dashboard-metrics.ts, dashboard-insights(.test).ts, financial-rows(.test).ts; web/components/reports/cash-flow-chart.tsx, pending-cost.tsx (novo), period-summary.tsx, sales-breakdown.tsx; web/components/financials/profit-summary.tsx, order-statement.tsx, order-parts.tsx; web/components/orders/order-page.tsx (do principal, mudança mínima); web/e2e/pending-cost.spec.ts (novo); docs
- Decisões tomadas nos pontos de parada: em 2026-10-15 o principal avisou (decisão do usuário) que os itens 13, 14, 18 e 23 ficam para depois: outro chat (CPF, `feat/cpf-supplier-per-store`) tira a trava por região e mexe em `supplier-coverage.ts`, `suppliers.ts`, `listings.ts`, `listing-overview.ts`, `catalog.functions.ts`, `listings.functions.ts`, `listing-commands.server.ts`, rotas de catálogo e fornecedores e notificações; este chat segue com o 09 e depois o 15 sem mexer nesses arquivos (avisar o principal antes se o 15 precisar). E2E novos com CPF usam `testCpf()`. 3 chats por área (coordenacao.md seção 0, 2026-10-15). ⏸1 do 09 (2026-10-15): modelo 1 (receita inteira, lucro sem o pendente), sem migration ("custo desconhecido" = item sem produto), item dividido em 09.b (servidor) e 09.c (telas); como a 09.b não tem tela, o ⏸2 dela foi junto com o ⏸3 (coordenacao 3.2)
- Pendências: o banco `sellbridge_desk_c` já tem aplicada a migration `0024_tenant_billing_holder` (da branch `wip/billing-holder`, ainda não juntada; `created_at` 1792022885802), embora o código desta branch pare na 0023; troca de região pelo admin (`customers.functions.ts`) deve chamar `requestStockSync` (chat B)

## Linha de base

| Métrica                                        | Valor                    | Medido em  |
| ---------------------------------------------- | ------------------------ | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1145 passando            | 2026-10-15 |
| E2E completo (`--workers=1`, porta 3160)       | 78 passando (principal)  | 2026-10-14 |
| Última migration                               | 0023_pending_indexes     | 2026-10-15 |
| Branch de trabalho                             | `claude/client-c-52dc32` | 2026-10-15 |

C5 de 2026-10-15 no banco C: 1125 no início (shared 298, marketplaces 149, web 392, worker 54, database 225, scripts 7); 1136 depois da 09.b (shared 301, web 394, database 231); 1145 depois da 09.c (web 403).

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit            | Notas                                      |
| ---- | ---------------------------------------------- | -------- | ----------------- | ------------------------------------------ |
| 08   | Produto ou fornecedor inativo e fora da região | ✅       | b2a3331 · 2135a1b | Juntado pelo principal (36ebac1)           |
| 09   | Lucro correto                                  | 🟡       | 118406a           | Receita só de pagos ✅ · 09.b ⏸3 · 09.c ⬜ |
| 13   | Erros de publicação claros                     | ⬜       | —                 | Para depois (decisão do usuário, 15/10)    |
| 14   | Publicação em massa: validação e progresso     | ⬜       | —                 | Para depois (decisão do usuário, 15/10)    |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —                 | Partir do `parseBrlToCents` do audit       |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —                 | Para depois (decisão do usuário, 15/10)    |
| 23   | Anúncios completos                             | ⬜       | —                 | Para depois (decisão do usuário, 15/10)    |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-15 · Item 09.c · Custo pendente nas telas — ✅ concluído (commit local; item 09 ✅)

- Financeiro: frase "R$ Y de N vendas ainda não têm custo e ficaram fora do lucro ⓘ. Do restante, …" (sublinhado tracejado neutro; só o pendente quando tudo é pendente); rodapé "N com custo pendente"; extrato com "Custo pendente" (bolinha âmbar) no lugar do lucro e "de R$ X · fora do lucro" (no celular só "de R$ X"); detalhe com "Produtos · custo pendente", "Lucro · fora do lucro" e a explicação; barra de partes hachurada.
- Gráfico (Financeiro e Painel): camada hachurada neutra "Custo pendente" entre custos e lucro nas barras "Tudo", degrau "Pendente" na cascata, linha nos tooltips (também no de margem), legenda só quando há pendente; custo = receita − pendente − lucro; margem sobre a receita com custo (cabeçalho, gráfico de margem, lojas, frase do Painel). Painel: "R$ Y em N vendas com custo pendente ficaram fora do lucro." Página do pedido: "custo pendente" no item.
- Revisão independente: 0 crítico/alto; corrigidos os 2 médios (tooltip de margem dizia "Sem vendas" numa semana só de pendente e não mostrava o pendente) e 6 baixos (legenda do gráfico de margem, frase quando tudo é pendente, página de pedido cancelado com item de fora, hachura SVG mais fina que a da legenda, plural da dica, seletor do e2e). Aceitos: degrau de topo quadrado quando o lucro é zero; parcela da cascata sobre a receita inteira (rotulada "da receita").
- Portões: lint, tipos, formatação, sem else ✅; 1145 testes (base 1136); build ✅ sem mudança no `routeTree.gen.ts`; e2e pending-cost, reports, order-page, webhooks e accessibility 23/23 em série (porta 3160), de novo depois das correções da revisão; D1 22 capturas (Financeiro barras e cascata, Painel, pedido, detalhe, tooltip; claro, escuro, celular); D2 0 px em 8 larguras × 3 telas; V13 0 marcas fora da área em 4 larguras × 2 tipos; D4 lado a lado com a linha "fora da receita".
- Achado no D1 e corrigido: no celular, "· fora do lucro" alargava a coluna e cortava o horário do grupo de vendas iguais.
- Dados de demonstração no `sellbridge_desk_c`: pedido DEMO-CUSTO-PENDENTE-09C (item sem produto, R$ 189,90). Sobras do `sale-resilience.spec` (SIM-EXP-*) também aparecem como custo pendente, o que está certo pela regra.

### 2026-10-15 · Item 09.b · Custo pendente fora do lucro (servidor) — ✅ concluído (92d2e56, commit local)

- Item sem produto do catálogo (anúncio criado fora da SellBridge) é "custo pendente": a venda conta na receita, e custo, tarifas, ajustes e lucro dela ficam em zero; a receita dela aparece à parte. Mesma regra em `computeOrderFinance` (custo `knownUnitCostCents: null`) e no SQL de `reports.ts`; resumo, série, lojas e extrato ganharam os campos do pendente. `orderFinanceInput` liga a página do pedido e a API pública. CSV com coluna "Custo pendente" e lucro em branco; API pública só com campos novos.
- Revisão independente: 1 alto corrigido (devoluções somavam no SQL e não no domínio; teste agora compara o resultado inteiro, e falha sem a correção); médios corrigidos: entrada do domínio com nome próprio (`knownUnitCostCents`) para nenhum pedido gravado entrar sem passar por `orderFinanceInput`, caso de pedido cancelado com item de fora, descrição do lucro na API. Aceitos: produto apagado viraria pendente (não há exclusão hoje; em `decisions.md`), reembolso de venda pendente fora dos totais (é a regra), arredondamento negativo (sem valor negativo possível).
- Portões: lint, tipos, formatação, sem else ✅; 1136 testes (base 1125); build ✅ sem mudança no `routeTree.gen.ts`; e2e reports, webhooks e order-page 18/18 em série (porta 3160). Sem tela (D0–D4 e A1–A3 ficam para a 09.c). Até a 09.c, o gráfico do Financeiro mostra a receita pendente como "custo" (conta receita − lucro).

### 2026-10-14 · Revisão de sanitização, async, performance, segurança, lógica e padrões de navegador — ✅ (commits locais)

- Prompt novo em `docs/prompts/revisao-sanitizacao-async-performance.md`, aplicado em seis frentes. Regras de código do usuário também no `CLAUDE.md` da raiz.
- Segurança: rotas HTTP `/organization/*` do Better Auth fechadas e criação/exclusão de organização desligadas (dava plano grátis infinito e exclusão em cascata); sessão confere membership; nome validado no cadastro. Parte do item 10.b do chat B, adiantada por ser grave.
- Sanitização: logger não grava parâmetros de consulta nem campos pessoais; `freeText()` remove caracteres de controle em todo texto livre; `permalink` do ML só https do próprio ML; textos do ML com tamanho máximo; erro de entrega de webhook em mensagens fixas.
- Async e lógica: pedido cancelado não volta a pago com webhook atrasado; venda de loja expirada fica pendente e entra após reconectar; entregas de webhook isoladas por item; fila de publicação com prazo; "respondido" só com resposta.
- Performance: contadores da fila de suporte só sobre chamados ativos; polling de Publicações 5 s; limpeza de eventos em lotes.
- Padrões de navegador: `color-scheme`, autofill, toque e barras de rolagem no tema; `Button` com `type="button"` padrão; campos com 17 px no celular; `Select` do projeto no admin; seletor de arquivo e `<details>` estilizados; imagens quebradas caem no mosaico; anéis de foco visíveis.
- Pendências: índices (migration), mensagem de Lojas por código (chat B), uploads (item 11, B), pedido dividido com cancelamento e pedido cancelado com envios ativos (principal), `pending` como receita (item 09), lote "já publicado" (item 14), CSP completa, rate limit por IP confiável.
- Portões: lint, tipos, formatação, sem else ✅; 1030 testes (base 1015); build ✅; e2e completo 72/72 (6 novos).

### 2026-10-14 · Auditoria de limites, comparações e valores que explodem — ✅ (commit local)

- Pedido do usuário (prompt de revisão). Cinco frentes de análise (dinheiro, entradas, datas, estoque e contadores, interface) e correções na origem: parser de BRL ("59.90" virava R$ 5.990,00), `::bigint` nas multiplicações do relatório (int4 estourava e derrubava o Financeiro), tetos de preço/custo, página ≤ 10.000, listas com máximo, CSV com no máximo 50 colunas, limites e datas dos pedidos do ML, IDs numéricos inseguros recusados, evento recusado pelo ML encerrado sem repetir, leitura de corpo com limite real de bytes, notificações inválidas do webhook não gravadas, venda no sino pela hora de chegada, datas no fuso de São Paulo e "ontem" por calendário, períodos entre 2000 e 2100, cancelamento sem pagamento fora do score do fornecedor, edição do produto no admin sem desfazer vendas, sincronização que esvazia o backlog em até 4 min, eventos de chamado em lotes de 1.000.
- Pendências que precisam de migration ou são de outro item: `billing_accounts.last_event_created` int4 (estoura em 2038), CHECKs de faixa nas colunas de dinheiro e quantidade, índices de `api_events.created_at` e `webhook_deliveries.event_id`, cursor da API pública por `xid`, `answeredAt` dos chamados; Stripe dentro da transação e carência na renovação (item 16, chat D); corpo de upload sem limite (item 11, chat B); custo desconhecido (item 09); markup abaixo do ponto de equilíbrio (item 15); validação de título/descrição na publicação em massa (item 14).
- Portões: lint, tipos, formatação, sem else ✅; 1015 testes (base 982); build ✅; e2e completo 66/66.

### 2026-10-13 · Item 08.b · Desativar pausa, avisa e reativar fica com o revendedor — ✅ concluído (2135a1b, commit local)

- Desativar produto ou fornecedor (botão ou CSV) pausa os anúncios publicados de todos os revendedores na mesma transação e diz ao admin quantos ("Produto desativado · 1 anúncio pausado"). Reativar não reativa: o revendedor decide; o servidor recusa retomar enquanto indisponível, com trava compartilhada contra a corrida com o admin.
- Card de Publicações: o rodapé vermelho do "esgotado" (`SoldOutFooter`) ganhou rótulo e motivo; preço riscado e foto em cinza sem a faixa "Esgotado"; menu mostra "Indisponível" (ou "Pausar" se ainda está no ar fora da região). Sino: tipo `listing_unavailable` na aba Problemas, permanente até o produto voltar, com link pela busca do título.
- Achado no D2 e corrigido (U-1 da auditoria): `fieldset` do `SegmentedControl` e do `FilterTabs` sem `min-w-0` estourava 86 px em 320 e 31 px em 375; a opção ativa agora rola para a vista. Restam os 21 px do cabeçalho em 1024 (tarefa separada).
- Auditoria das escritas do catálogo adiada para o item 28 (principal), por decisão do usuário; índice em `listings.supplier_product_id` pedido ao principal.
- Revisão independente: 0 crítico/alto; corrigidos a corrida reativar × desativar (teste de concorrência que falha sem a trava), o link do sino, "Pausar" para anúncio indisponível ainda no ar e um comentário órfão. Aceitos: reativação em massa mista pula os indisponíveis sem nomeá-los (a lista corrige no recarregamento); possível deadlock raro entre pausas concorrentes (erro visível, sem dano).
- Portões: lint, tipos, formatação, sem else ✅; 981 testes (base 959 + 8 da junção com o principal); build ✅; e2e afetados ✅; D1 capturas (card, sino, admin; claro, escuro, celular); D2 0 px em 7 larguras (1024: cabeçalho); D4 lado a lado com o card "Esgotado".

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
