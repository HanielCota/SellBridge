# Andamento da execução tela a tela · chat paralelo C

Registro do chat paralelo C ([chat-paralelo-c.md](../prompts/chat-paralelo-c.md)), que segue o prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md) para os itens 08, 09, 15, 13, 14, 18 e 23 (divisão por área em [coordenacao.md](../prompts/coordenacao.md)), no worktree `SellBridge-c` (branch `feat/client-phase-1-c`, banco `sellbridge_desk_c`). O chat principal junta este arquivo ao `execucao-progresso.md` antes do push final.

## Em andamento

- Item/parte: 09 · Lucro correto
- Última etapa concluída: — (08 ✅ 2135a1b; junção com o principal 3f909a7)
- Próximo passo: etapa 1 · ler o item 09 e os IDs B10 e G4 do relatório
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: 5 chats por área e os 3 ajustes (senha da vez, menos paradas sem tela, recursos isolados), aprovados em 2026-10-14
- Pendências: índice em listings.supplier_product_id (migration, chat E ou principal); troca de região pelo admin (customers.functions.ts) deve chamar requestStockSync

## Linha de base

| Métrica                                        | Valor                     | Medido em  |
| ---------------------------------------------- | ------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 982 passando              | 2026-10-14 |
| E2E completo (`--workers=1`, porta 3160)       | 63 passando               | 2026-10-13 |
| Última migration                               | 0022_order_status_changes | 2026-10-14 |
| Branch de trabalho                             | `feat/client-phase-1-c`   | 2026-10-13 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

| Item | Título                                         | Situação | Commit            | Notas                                 |
| ---- | ---------------------------------------------- | -------- | ----------------- | ------------------------------------- |
| 00   | Preparação do dia (chat C)                     | ✅       | —                 | Linha de base 937 no banco C          |
| 08   | Produto ou fornecedor inativo e fora da região | ✅       | b2a3331 · 2135a1b | 08.a ✅ b2a3331 · 08.b ✅ 2135a1b     |
| 09   | Lucro correto                                  | ⬜       | —                 |                                       |
| 10   | Segurança de contas e da equipe                | ⬜       | —                 | Passou para o chat B (coordenacao.md) |
| 13   | Erros de publicação claros                     | ⬜       | —                 |                                       |
| 14   | Publicação em massa: validação e progresso     | ⬜       | —                 |                                       |
| 15   | Uma regra só de taxa e margem                  | ⬜       | —                 |                                       |
| 16   | Riscos da assinatura                           | ⬜       | —                 | Passou para o chat D (coordenacao.md) |
| 18   | CSV com atributos do Mercado Livre             | ⬜       | —                 |                                       |
| 23   | Anúncios completos                             | ⬜       | —                 | Veio do principal (coordenacao.md)    |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

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
