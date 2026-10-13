# Andamento da execução tela a tela

Registro vivo do prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md). Cada sessão **lê este arquivo antes de começar** e **atualiza o bloco "Em andamento" ao terminar cada etapa** e a tabela ao terminar cada parte. É a memória entre sessões: o que não está aqui não aconteceu.

## Em andamento

_(nenhum)_

## Linha de base

| Métrica                                                         | Valor                   | Medido em  |
| --------------------------------------------------------------- | ----------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`)                  | 848 passando            | 2026-10-13 |
| Testes web (`apps/web` vitest)                                  | 318 passando            | 2026-10-13 |
| E2E de suporte, admin, reviews e acessibilidade (`--workers=1`) | 15 passando             | 2026-10-13 |
| Última migration                                                | 0017_stock_reservations | 2026-10-13 |
| Branch de trabalho                                              | `feat/client-phase-1`   | 2026-10-12 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

Itens com partes (seção 9.0 do prompt) registram cada parte na coluna Notas (ex.: `01.a ✅ abc1234 · 01.b ⬜`). O item só vira ✅ quando todas as partes estão ✅.

| Item | Título                                          | Situação | Commit            | Notas                                                            |
| ---- | ----------------------------------------------- | -------- | ----------------- | ---------------------------------------------------------------- |
| 00   | Preparação do dia                               | ✅       | 6ef08d0 · 6801888 | Árvore herdada revisada duas vezes e commitada (local, sem push) |
| 01   | Estoque: reserva e baixa na venda               | 🟡       | b828b38           | 01.a ✅ b828b38 · 01.b ✅ 51273db · 01.c ⬜                      |
| 02   | Anúncio duplicado e publicação travada          | ⬜       | —                 |                                                                  |
| 03   | Mesma conta do ML em dois revendedores          | ⬜       | —                 |                                                                  |
| 04   | Status completos do pedido e do rastreio do ML  | ⬜       | —                 |                                                                  |
| 05   | Migration 0008 pulada em bancos antigos         | ⬜       | —                 |                                                                  |
| 06   | Envio cancelado e reencaminhamento              | ⬜       | —                 |                                                                  |
| 07   | Fornecedor não declara "entregue" sozinho       | ⬜       | —                 |                                                                  |
| 08   | Produto ou fornecedor inativo e fora da região  | ⬜       | —                 |                                                                  |
| 09   | Lucro correto                                   | ⬜       | —                 |                                                                  |
| 10   | Segurança de contas e da equipe                 | ⬜       | —                 |                                                                  |
| 11   | Uploads seguros                                 | ⬜       | —                 |                                                                  |
| 12   | Admin muda a região e apaga o endereço          | ⬜       | —                 |                                                                  |
| 13   | Erros de publicação claros                      | ⬜       | —                 |                                                                  |
| 14   | Publicação em massa: validação e progresso      | ⬜       | —                 |                                                                  |
| 15   | Uma regra só de taxa e margem                   | ⬜       | —                 |                                                                  |
| 16   | Riscos da assinatura                            | ⬜       | —                 |                                                                  |
| 17   | Link do fornecedor e diagnóstico                | ⬜       | —                 |                                                                  |
| 18   | CSV com atributos do Mercado Livre              | ⬜       | —                 |                                                                  |
| 19   | Pequenos de segurança e status                  | ⬜       | —                 |                                                                  |
| 20   | Página do pedido                                | ⬜       | —                 |                                                                  |
| 21   | Encaminhamento automático e aviso ao fornecedor | ⬜       | —                 | Depende de D6                                                    |
| 22   | Rastreio automático e previsão                  | ⬜       | —                 |                                                                  |
| 23   | Anúncios completos                              | ⬜       | —                 |                                                                  |
| 24   | Saúde das lojas                                 | ⬜       | —                 |                                                                  |
| 25   | Central de notificações                         | ⬜       | —                 | WhatsApp depende de D9                                           |
| 26   | Onboarding previsível e conta completa          | ⬜       | —                 |                                                                  |
| 27   | Suporte: o que falta                            | ⬜       | —                 |                                                                  |
| 28   | Admin da plataforma                             | ⬜       | —                 |                                                                  |
| 29   | Painel do mockup do cliente                     | ⬜       | —                 | Layout depende de D8                                             |
| 30   | LGPD e proteção da conta                        | ⬜       | —                 |                                                                  |
| 31   | Planos como no PDF                              | ⬜       | —                 | Depende de D10                                                   |
| 32   | Infra                                           | ⬜       | —                 |                                                                  |
| 33   | Shopee                                          | ⛔       | —                 | Sem credenciais de parceiro                                      |
| 34   | Pagamento ao fornecedor (split e custódia)      | ⛔       | —                 | Depende de D1–D4                                                 |
| 35   | Conquistas digitais e Club                      | ⛔       | —                 | Depende de decisão do cliente                                    |
| 36   | IA assistente                                   | ⛔       | —                 | Depende de decisão do cliente                                    |
| 37   | Fiscal e contabilidade                          | ⛔       | —                 | Depende de decisão contábil                                      |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-13 · Item 01.b · Sync imediato, estoque de segurança e "atualizado há X" — ✅ concluído (51273db, commit local)

- Divisão aprovada no ⏸1: 01.b (esta) e 01.c (falta visível ao revendedor + admin vê reservado).
- Sync na hora após pedido que move estoque (worker, `stockMoves`), envio pela web/link/ML (`shipments.server.ts`) e admin (`requestStockSync` único). `STOCK_SAFETY_UNITS` (padrão 0) no sync e na publicação (`offeredUnits`/`liveStock`). Linha de estoque com "atualizado há X" no catálogo e na página do fornecedor; rodapé dos cards quebra linha no celular.
- Portões: lint, tipos, formatação, sem else ✅; 848 testes (base 838); build ✅; e2e 24 + 3 ✅ (inclui `stock.spec`: venda simulada reduz o catálogo; data aparece); D2 sem rolagem nas 8 larguras **exceto 1024 px**, que já rolava 21 px antes por causa do cabeçalho (fora do escopo, vale para todas as telas); D4 lado a lado sem perda frente à referência.
- Revisão independente: e2e instável com specs paralelos (agora só exige que o número caia), pedido de sync do worker sem prazo (agora 3 s e mesma política de retentativa da web), margem com entrada inválida (função única `safetyMargin`), texto da data corrigido nos docs. Mantido e documentado: sem deduplicação de jobs de sync; syncs extras inofensivos.
- Fora do escopo: cabeçalho rola 21 px na horizontal em 1024 px em todas as páginas (`top-nav.tsx`, layout regular); em 320 px os preços do card de produto do fornecedor ficam colados ("R$ 57,98R$ 125,90", `supplier-product-card.tsx`).

### 2026-10-13 · Item 01.a · Reserva de estoque na venda — ✅ concluído (b828b38, commit local)

- Modelo prateleira (`stock`, do admin) + `reserved_stock` (pedidos pagos não enviados); disponível = diferença, usado em catálogo, anúncios, publicação e sync. Estado por item em `order_items.stock_state` (migration 0017), regra em `shared/domain/stock-reservation.ts`, aplicada na transação do pedido e no envio marcado pelo fornecedor.
- Portões: lint, tipos, formatação, sem else ✅; 837 testes (base 795); build ✅; M1 ✅, M2 ✅ (itens antigos `untracked`, check de reservado ≥ 0), M3 ✅; e2e 24 + 16 ✅ (publicação, fornecedores, admin, operação, relatórios).
- Revisão independente 1: ALTO (CSV do admin apagava reservas) → redesenho para prateleira + reservado, escolhido pelo usuário. Revisão 2: deadlock CSV × venda (`FOR NO KEY UPDATE` em ordem de id), envio do fornecedor sem baixa (corrigido, teste), devolução após envio acima da contagem (sem clamp, teste), seed `untracked`, limite de pedidos antigos documentado. Pendentes para 01.b: admin ver "reservado"; aviso de falta ao revendedor.
- Revisão de vícios de IA (a pedido do usuário): 1 bug (venda alterava `updated_at` do produto, o que quebraria o "estoque atualizado há X"; teste novo) e 6 vícios corrigidos: `shiftShelf` em vez de 4 updates repetidos, reserva que ignorava o resultado da troca de estado, imports fora do grupo, comentário com verbo ambíguo ("settles"), comentário do seed partindo campos pareados, opção morta e pedido duplicado no teste. 838 testes, build ✅.
- Fora do escopo: no celular (390 px), a última aba de filtro de Publicações ("Pausadas") encosta na borda; checar no item que mexer nessa tela (regra V5).
- Achado de ambiente: o servidor da porta 3300 (de outra sessão) não enxerga o export novo `@sellbridge/shared/stock-reservation` sem reiniciar e mostra erro no catálogo; as capturas foram feitas num servidor próprio na 3400.

### 2026-10-13 · Item 00 · Preparação do dia — ✅ concluído

- A árvore tinha, além das correções de design de 12/10, a funcionalidade "ferramentas do chamado" (migration 0016: `ticket_orders`, `ticket_followers`; respostas rápidas, rascunho, painel de contexto, histórico para o revendedor, prévia de imagem). O usuário escolheu revisar e commitar junto.
- Portões: C1–C6 ✅ (795 testes; base 782), M1 ✅ banco novo, M2 ✅ 0000–0015 à mão + só a 0016 (tabelas novas, sem backfill), M3 ✅, C7 ✅ 15 e2e + support.spec de novo após as correções (6).
- Revisão independente: 0 crítico/alto. Corrigidos: M1 e-mail para quem saiu da loja ou foi banido (teste novo), M2 colar do Word/Excel virava anexo, L4 resposta rápida passava de 5.000 caracteres (teste novo). Fora do escopo: L1 colega reativa e-mail de quem silenciou, L2 chave de cache sem tenant (o app não troca de organização sem sair, e sair limpa o cache), L3 rascunho por chamado e não por pessoa, L5 vincular pedido em chamado encerrado, L6 índice em `ticket_followers.user_id`, L7 "visto pelo suporte" quando o atendente é da própria loja.
- Segunda revisão (bugs e vícios de IA, a pedido do usuário): 10 achados, todos corrigidos. Diálogo de colega limpa erro e escolha ao fechar; e-mails com `allSettled` e contagem de falhas; busca de pedidos sem acento e por palavra (`matchesEveryWord`, teste novo); `CopyButton` reaproveitado no código do chamado; `SearchInput` no seletor de pedidos; `ExpectedReplyText` removido; lista de pedidos só leitura para a equipe; "desligado" em texto; regra V2 passa a aceitar o tom de aviso de `ToneStatus`. Portões de novo: lint, tipos, formatação, sem else, 795 testes, build e 18 e2e (suporte, admin, avaliações, acessibilidade, integrações).
