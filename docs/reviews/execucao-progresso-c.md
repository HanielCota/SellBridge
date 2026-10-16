# Andamento da execução tela a tela · chat paralelo C

Registro do chat C ([coordenacao.md](../prompts/coordenacao.md), seção 0: catálogo, publicação e dinheiro), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md). Desde 2026-10-15 roda na worktree `.claude/worktrees/client-c-52dc32` (branch `claude/client-c-52dc32`, criada de `feat/client-phase-1` em `27366e3`), banco `sellbridge_desk_c`, Redis db 4, preview `sellbridge-c` na 3600 e e2e na 3160 · 3161 · db 5. O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 14.a · Validações do servidor iguais às do fluxo individual e bloqueio sem estoque
- Última etapa concluída: 8 · Documentar (⏸3 aguardando OK, 2026-10-16); ⏸1 aprovado em 2026-10-16 (com o estoque de segurança)
- Próximo passo: depois do OK, commit local; depois a 14.b (`ProgressWithEta`)
- Arquivos tocados: shared/domain/bulk-publish-plan(.test).ts (novo), shared/package.json; web/lib/server/environment-schema.ts (STOCK_SAFETY_UNITS); web/features/listings/listing-commands.server.ts; web/features/catalog/catalog.functions.ts e bulk-skip-reasons.ts (novo); web/components/catalog/bulk-publish-dialog.tsx (toast); e2e/publishing.spec.ts; docs
- Decisões tomadas nos pontos de parada: em 2026-10-15 o principal avisou (decisão do usuário) que os itens 13, 14, 18 e 23 ficam para depois: outro chat (CPF, `feat/cpf-supplier-per-store`) tira a trava por região e mexe em `supplier-coverage.ts`, `suppliers.ts`, `listings.ts`, `listing-overview.ts`, `catalog.functions.ts`, `listings.functions.ts`, `listing-commands.server.ts`, rotas de catálogo e fornecedores e notificações; este chat segue com o 09 e depois o 15 sem mexer nesses arquivos (avisar o principal antes se o 15 precisar). E2E novos com CPF usam `testCpf()`. 3 chats por área (coordenacao.md seção 0, 2026-10-15). ⏸1 do 09 (2026-10-15): modelo 1 (receita inteira, lucro sem o pendente), sem migration ("custo desconhecido" = item sem produto), item dividido em 09.b (servidor) e 09.c (telas); como a 09.b não tem tela, o ⏸2 dela foi junto com o ⏸3 (coordenacao 3.2)
- Pendências: 15.b liberada pelo principal (2026-10-15) em `listing-commands.server.ts`, `listing-overview.ts`, `catalog-product-card.tsx`, `price-receipt.tsx`, `listing-card.tsx`, `edit-price-dialog.tsx`, `features/listings/profit.ts` e na server function nova em `features/reports`; `publicacoes/nova.tsx` fica para o fim, por cima da etapa 4 do CPF (o principal avisa quando juntar); não mexer em `publish-listing.server.ts`, `listings.functions.ts`, `catalog.functions.ts`, `bulk-publish-dialog.tsx` nem `listings-write.server.ts`; e2e `fulfillment.spec.ts:95` falha desde o 5f823ba do principal (título do link do fornecedor mudou; avisado); `stock.spec` instável com workers em paralelo (`firstPublishedTitle` pega a luminária desativada do `catalog-deactivation`; usar um anúncio da seed); o banco `sellbridge_desk_c` já tem aplicada a migration `0024_tenant_billing_holder` (da branch `wip/billing-holder`, ainda não juntada; `created_at` 1792022885802), embora o código desta branch pare na 0023; troca de região pelo admin (`customers.functions.ts`) deve chamar `requestStockSync` (chat B)

## Linha de base

| Métrica                                        | Valor                    | Medido em  |
| ---------------------------------------------- | ------------------------ | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1331 passando            | 2026-10-15 |
| E2E completo (`--workers=1`, porta 3160)       | 78 passando (principal)  | 2026-10-14 |
| Última migration                               | 0023_pending_indexes     | 2026-10-15 |
| Branch de trabalho                             | `claude/client-c-52dc32` | 2026-10-15 |

C5 de 2026-10-15 no banco C: 1125 no início (shared 298, marketplaces 149, web 392, worker 54, database 225, scripts 7); 1136 depois da 09.b (shared 301, web 394, database 231); 1145 depois da 09.c (web 403).

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit                      | Notas                                       |
| ---- | ---------------------------------------------- | -------- | --------------------------- | ------------------------------------------- |
| 08   | Produto ou fornecedor inativo e fora da região | ✅       | b2a3331 · 2135a1b           | Juntado pelo principal (36ebac1)            |
| 09   | Lucro correto                                  | ✅       | 118406a · 92d2e56 · 7772cb6 | 09.b servidor · 09.c telas · junção 93a3d30 |
| 13   | Erros de publicação claros                     | 🟡       | daf26cc                     | 13.a ✅ daf26cc · 13.b ⏸3                   |
| 14   | Publicação em massa: validação e progresso     | 🟡       | —                           | 14.a no ⏸1 (16/10)                          |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —                           | Partir do `parseBrlToCents` do audit        |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —                           | Para depois (decisão do usuário, 15/10)     |
| 23   | Anúncios completos                             | ⬜       | —                           | Para depois (decisão do usuário, 15/10)     |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-16 · Item 14.a · Massa com as regras do individual e sem estoque bloqueado — ⏸3 aguardando OK

- `planBulkPublish` (shared) aplica título, descrição, estoque (com o estoque de segurança) e "já publicado"; a massa publica os válidos e devolve os pulados com motivo; nenhum válido recusa o lote com nomes e motivos. O fluxo individual (e a API pública, pelo mesmo comando) recusa produto sem estoque.
- Sem revisão independente obrigatória (sem dinheiro, auth ou migration; 9 arquivos); autorrevisão sem achados. Um teste da web (`webhooks.server.test`, Redis travado) falhou uma vez com a máquina carregada e passou sozinho (9/9): instabilidade de tempo, sem relação; o mesmo com `store-supplier-change.test.ts` (do CPF), que estourou 5 s uma vez na suíte e passou sozinho duas vezes e na suíte de novo. Portões: lint, tipos, formatação, sem else ✅; 1631 testes; build ✅ sem mudança no `routeTree.gen.ts`; e2e `publishing.spec` 11/11 em série (inclui o novo "recusa no servidor publicar um produto sem estoque").

### 2026-10-16 · Item 13.b · Descrição recusada vira aviso com reenvio — ✅ concluído (commit local; item 13 ✅)

- Conector: `publishProduct` devolve `descriptionError` (em português) sem falhar a publicação; `updateDescription` com PUT `?api_version=2` (página oficial). Migration 0032 (`description_error`, `description_failed_at`, `description_attempts`). O job de sincronização reenvia até 3 vezes; "Reenviar descrição" no card zera as tentativas e pede a sincronização na hora; a lista consulta por até 5 min para o aviso sumir sozinho.
- Revisão independente: 0 alto; 3 médios corrigidos com teste de regressão que falha sem a correção: (1) a reconciliação (item já criado) postava a descrição de novo com POST, que o ML recusa, e mostrava falso "Descrição não enviada": agora substitui com PUT; (2) recusa do próprio texto gastava as 3 tentativas: agora a recusa não repetível encerra as automáticas na hora, e a mensagem pede o suporte (não há edição de descrição antes do item 23); (3) as descrições rodam primeiro, em fatia própria de 30 s, para a sincronização longa de estoque não deixá-las de fora. Baixos corrigidos: reenvio só para anúncio no ar ou pausado em loja conectada (teste), busca com try/catch, `inArray`, checagem explícita de nulo, motivo longo quebra linha. Aceitos: sem índice parcial para a consulta de "ativos" (exige migration; fica para o 32), só o motivo da primeira loja no card, corrida rara entre reenvio e sincronização (o pior caso é uma tentativa a mais).
- Achado no D1 e corrigido: no celular o botão passava da borda do card (dois cards por linha); agora "Reenviar", em largura total, com nome acessível completo.

### 2026-10-15 · Item 13.a · Erros do ML com `cause[]` em português — ✅ concluído (commit local)

- `error-messages.ts` traduz os códigos da página oficial "Validações" do ML ("o que aconteceu. o que fazer."), ignora avisos, mostra até dois erros, cita o ML (até 300 caracteres) quando o código é desconhecido e mantém a mensagem antiga sem `cause`. `readError` usa a tradução e leva os códigos em `details.causes` para o log. Fixtures no formato da documentação.
- Sem revisão independente (item pequeno: sem dinheiro, auth ou migration; 7 arquivos); autorrevisão sem achados.

### 2026-10-15 · Item 15.b · Prévia com todas as taxas e piso de preço — ✅ concluído (commit local; item 15 ✅)

- Prévias (cards do catálogo e de anúncio, recibo da massa, Nova publicação, Editar preço) com o modelo de taxa e a linha "Taxa da SellBridge (x%)"; atalhos de margem pelo menor preço correto. Piso no servidor ao criar, editar (e API pública) e na massa, com as mesmas palavras na tela, antes de enviar.
- Revisão independente: 0 crítico; 1 alto corrigido (o diálogo da massa não conferia o piso e o lote era recusado no servidor: agora mostra o problema e trava o botão; e2e novo), médios corrigidos (Nova publicação confere antes de enviar e esconde preços prontos abaixo do piso; massa com o mesmo código de erro e a mesma mensagem, que cita a margem mínima), baixos corrigidos (textos da API pública, comentário órfão em `listing-rules.ts`, checagens explícitas, atalho abaixo da margem mínima, nome do teste, teste com margem mínima de 10%). Aceitos: categoria fora do piso até haver taxa por categoria; padrão de 14% se a busca do modelo falhar.
- Portões: lint, tipos, formatação, sem else ✅; 1331 testes (shared 349, web 512, database 258, worker 56, marketplaces 149, scripts 7); build ✅ sem mudança no `routeTree.gen.ts`; e2e publishing, accessibility, suppliers, stock, reports e catalog-deactivation 32/32 em série; D1 20 capturas (Nova publicação, Editar preço com e sem piso, recibo da massa com e sem piso; claro, escuro, celular, com taxa da SellBridge de 4%); D2 0 px em 8 larguras × 3 telas.
- Dados de demonstração no `sellbridge_desk_c`: a loja "Ana Moda" da conta demo ficou ligada ao Ateliê Divinópolis (depois da 0025, nenhuma loja da conta tinha fornecedor e a Nova publicação não abria).

### 2026-10-15 · Item 15.a · Modelo único de taxa (servidor) — ✅ concluído (commit local)

- `shared/domain/fee-model.ts`: `FeeSchedule` (taxa do marketplace, taxa por categoria vazia, taxa da plataforma, frete estimado, margem mínima), `estimateSale` pelo próprio `computeOrderFinance` e `priceForMargin` com todas as taxas. Configuração validada (`ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS` 1400, `ESTIMATED_SHIPPING_CENTS` 0 com TODO(client:D5), `MIN_MARGIN_PERCENT` 0) e `getFeeSchedule` para a 15.b. Nada muda na tela ainda.
- Teste de banco "a prévia e o Financeiro dão o mesmo lucro para a mesma venda" falhava (R$ 63,01 previsto × R$ 56,61 no relatório, com taxa da plataforma de 4%) e passa, inclusive com meio centavo de arredondamento.
- Revisão independente: 1 médio corrigido (`priceForMargin` não devolvia sempre o menor preço; teste por força bruta e o caso R$ 16,60 × R$ 16,62, que falha na versão antiga); baixos corrigidos: teto de preço, margem validada, casos de custo 0 e do limite nulo. Aceitos: `z.coerce` aceita "1e3" como as outras variáveis numéricas; frete junto da tarifa depende da D5.
- Portões: lint, tipos, formatação, sem else ✅; 1263 testes (base 1236 depois da junção, 27 novos: shared 18, web 8, database 1); build ✅ sem mudança no `routeTree.gen.ts`; sem tela (D0–D4 e e2e não se aplicam).

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
