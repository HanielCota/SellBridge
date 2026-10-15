# Andamento da execução tela a tela

Registro vivo do prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md). Cada sessão **lê este arquivo antes de começar** e **atualiza o bloco "Em andamento" ao terminar cada etapa** e a tabela ao terminar cada parte. É a memória entre sessões: o que não está aqui não aconteceu.

## Em andamento

- Item/parte: X-1 · confirmação de "Cancelar envio" (com X-3, mesmos botões)
- Última etapa concluída: 4 · Testes (⏸2 aguardando OK). ⏸1 aprovado em 2026-10-14, com o `ShipmentActions` incluído
- Próximo passo: depois do OK, etapa 5 (implementar): `ConfirmDialog` com rótulo de saída, diálogo de cancelamento com motivo, ocorrência vazia com alerta, `ShipmentActions` recebendo o objeto do `useShipmentUpdate`. Próxima migration: 0025, pela "senha da vez" (3 chats)
- Arquivos tocados: apps/web/e2e/fulfillment.spec.ts (auxiliar `forwardedOrder` e 3 testes novos; o teste de cancelamento existente passa a confirmar pelo diálogo)
- Decisões tomadas nos pontos de parada: **chat único desde 2026-10-14** (o usuário encerrou os chats B, C, D e E). Este chat faz todos os itens que faltam, na ordem da tabela; `docs/prompts/coordenacao.md` fica só como histórico.
- Pendências: "trocar de fornecedor num envio cancelado"; lembrar o revendedor de confirmar entrega parada em "Enviado" (com o 22); mensagem de conflito do 02.a usa o nome bruto da loja; confirmar com conta de teste do ML se GET /shipments/{id} traz o endereço e o link da venda; tópicos shipments e post_purchase não assinados; ShipmentActions recebe ~13 props; sync em paralelo por loja do audit não trazido (fica para o 32.e); nome do cadastro guardado sem `trim` (o audit corrigia, ficou de fora por mexer no hook do Better Auth; ver item 10); **a recuperar das pastas antigas `.claude/worktrees/` (11/10, nunca commitadas)**: (1) o painel de atenção e o aviso do sino mandam "pedidos para avaliar" para `/pedidos` sem abrir a aba de avaliações (`attention-panel.tsx:86`, `notification-presenter.ts:117`) — bug real, de `pedidos-pending-filter`; (2) contraste do modo claro (`--brand-mark`, `--finance-gain`, `--ring` mais escuro, bolinhas de status, switch desligado visível), de `light-mode-verification`; (3) manter a rolagem ao trocar filtro (`resetScroll: false`), de `financeiro-page-reset-bug`; (4) seed mais completo (workspace do admin, clientes e chamados de exemplo), de `http-500-error-localhost`, precisa ser refeito para o schema atual; (5) opcionais: `useRevealActive`, `reviewHint`, foto que falha antes da hidratação, `ticket-diagnosis`. As outras 5 pastas antigas já estão no código ou foram descartadas por design

### Pacote do ⏸1 do X-1 (apresentado em 2026-10-14, aguardando OK)

- **Hoje** (`components/fulfillment/shipment-panel.tsx`): "Cancelar envio" cancela no clique, sem confirmar, também no link público do fornecedor (celular, toque errado avisa a loja). O botão fica desativado até preencher "Ocorrência ou observação", sem dizer por quê (X-3).
- **Proposta** (referência: `ConfirmDialog`, já usado em desconectar loja e revogar chave):
  1. "Cancelar envio" sempre ativo, abre diálogo de confirmação com o campo obrigatório **"Motivo do cancelamento"**, preenchido com o que já estiver em "Ocorrência".
  2. Texto por quem cancela. Fornecedor: "Cancelar este envio?" (a loja é avisada com o motivo e pode encaminhar a outro fornecedor; o link passa a mostrar só o histórico). Revendedor: "Cancelar o envio de {fornecedor}?" (o link deixa de valer; dá para reencaminhar com link novo enquanto o pedido estiver pago).
  3. Botões "**Voltar**" e "**Cancelar envio**" (vermelho); o `ConfirmDialog` ganha rótulo opcional no botão de saída.
  4. **X-3:** "Registrar ocorrência" sempre ativo; com o campo vazio mostra no próprio campo "Escreva a ocorrência antes de registrar".
- **Testes do ⏸2:** e2e no link do fornecedor (fechar o diálogo não cancela; confirmar sem motivo é recusado; com motivo cancela e a loja vê o aviso no sino); e2e do revendedor no diálogo "Operar pedido"; e2e da ocorrência vazia.
- **Pergunta em aberto:** resolver junto o `ShipmentActions` com ~13 propriedades (passar o objeto `useShipmentUpdate` inteiro)?

## Linha de base

| Métrica                                        | Valor                 | Medido em  |
| ---------------------------------------------- | --------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1125 passando         | 2026-10-14 |
| Testes web (`apps/web` vitest)                 | 392 passando          | 2026-10-14 |
| E2E completos (`--workers=1`)                  | 78 passando           | 2026-10-14 |
| Última migration                               | 0023_pending_indexes  | 2026-10-14 |
| Branch de trabalho                             | `feat/client-phase-1` | 2026-10-12 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

Itens com partes (seção 9.0 do prompt) registram cada parte na coluna Notas (ex.: `01.a ✅ abc1234 · 01.b ⬜`). O item só vira ✅ quando todas as partes estão ✅.

| Item | Título                                          | Situação | Commit                      | Notas                                                               |
| ---- | ----------------------------------------------- | -------- | --------------------------- | ------------------------------------------------------------------- |
| 00   | Preparação do dia                               | ✅       | 6ef08d0 · 6801888           | Árvore herdada revisada duas vezes e commitada (local, sem push)    |
| 01   | Estoque: reserva e baixa na venda               | ✅       | b828b38 · 51273db · f78b913 | 01.a ✅ b828b38 · 01.b ✅ 51273db · 01.c ✅ f78b913                 |
| 02   | Anúncio duplicado e publicação travada          | ✅       | 4925280 · d07b7e2           | 02.a ✅ 4925280 · 02.b ✅ d07b7e2 · acabamento 124372a              |
| 03   | Mesma conta do ML em dois revendedores          | ⬜       | —                           |                                                                     |
| 04   | Status completos do pedido e do rastreio do ML  | ✅       | be3b6f1 · 50119db · ccab61f | 04.a ✅ be3b6f1 · 04.b ✅ 50119db · 04.c ✅ ccab61f                 |
| 05   | Migration 0008 pulada em bancos antigos         | ✅       | acb48dd                     |                                                                     |
| 06   | Envio cancelado e reencaminhamento              | ✅       | b68dbe5                     |                                                                     |
| 07   | Fornecedor não declara "entregue" sozinho       | ✅       | 4b7eba9                     |                                                                     |
| 08   | Produto ou fornecedor inativo e fora da região  | ✅       | b2a3331 · 2135a1b           | Feito no chat C; 08.a ✅ b2a3331 · 08.b ✅ 2135a1b (junção 36ebac1) |
| 09   | Lucro correto                                   | 🟡       | 118406a                     | Receita só de pedidos pagos veio do audit; falta o custo pendente   |
| 10   | Segurança de contas e da equipe                 | ⬜       | —                           |                                                                     |
| 11   | Uploads seguros                                 | ⬜       | —                           |                                                                     |
| 12   | Admin muda a região e apaga o endereço          | ⬜       | —                           |                                                                     |
| 13   | Erros de publicação claros                      | ⬜       | —                           |                                                                     |
| 14   | Publicação em massa: validação e progresso      | ⬜       | —                           |                                                                     |
| 15   | Uma regra só de taxa e margem                   | ⬜       | —                           |                                                                     |
| 16   | Riscos da assinatura                            | ⬜       | —                           |                                                                     |
| 17   | Link do fornecedor e diagnóstico                | ⬜       | —                           |                                                                     |
| 18   | CSV com atributos do Mercado Livre              | ⬜       | —                           |                                                                     |
| 19   | Pequenos de segurança e status                  | ⬜       | —                           |                                                                     |
| 20   | Página do pedido                                | ✅       | bbf14fc · c6b7987 · ffff29f | 20.a ✅ bbf14fc · 20.b ✅ c6b7987 · 20.c ✅ ffff29f                 |
| 21   | Encaminhamento automático e aviso ao fornecedor | ⬜       | —                           | Depende de D6                                                       |
| 22   | Rastreio automático e previsão                  | ⬜       | —                           |                                                                     |
| 23   | Anúncios completos                              | ⬜       | —                           |                                                                     |
| 24   | Saúde das lojas                                 | ⬜       | —                           |                                                                     |
| 25   | Central de notificações                         | ⬜       | —                           | WhatsApp depende de D9                                              |
| 26   | Onboarding previsível e conta completa          | ⬜       | —                           |                                                                     |
| 27   | Suporte: o que falta                            | ⬜       | —                           |                                                                     |
| 28   | Admin da plataforma                             | ⬜       | —                           |                                                                     |
| 29   | Painel do mockup do cliente                     | ⬜       | —                           | Layout depende de D8                                                |
| 30   | LGPD e proteção da conta                        | ⬜       | —                           |                                                                     |
| 31   | Planos como no PDF                              | ⬜       | —                           | Depende de D10                                                      |
| 32   | Infra                                           | ⬜       | —                           |                                                                     |
| 33   | Shopee                                          | ⛔       | —                           | Sem credenciais de parceiro                                         |
| 34   | Pagamento ao fornecedor (split e custódia)      | ⛔       | —                           | Depende de D1–D4                                                    |
| 35   | Conquistas digitais e Club                      | ⛔       | —                           | Depende de decisão do cliente                                       |
| 36   | IA assistente                                   | ⛔       | —                           | Depende de decisão do cliente                                       |
| 37   | Fiscal e contabilidade                          | ⛔       | —                           | Depende de decisão contábil                                         |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-15 · Titular da conta (CPF) e fornecedores abertos — ✅ juntado (e4d8343 · 821693b, junção 63a301a)

- Trabalho feito por uma sessão aberta fora do fluxo ("Mudanças de layout do website"), que escrevia direto nesta pasta. Parada a pedido do usuário, levado para a branch `wip/billing-holder` e revisado como um item.
- O que entra: cadastro e "Alterar seus dados" pedem nome completo e CPF (aviso de uso em notas fiscais e cobranças); migration 0024 (`full_name`, `cpf` anuláveis em `tenant_profile`); passo do guia "Seu cadastro"; Fornecedores e a página de cada fornecedor abertos a todos, com "Entrega na sua região" / "Não entrega no seu CEP", filtro "Só quem entrega no meu CEP" e aviso na página de quem não entrega (sem botão Publicar). A cobertura continua exigida no servidor para publicar.
- Revisão independente: sem achado alto. Corrigidos: CPF e nome iam para o navegador do admin (`getCustomerDetail` e troca de região) → endereço sem o titular; política de privacidade passa a citar CPF, nome completo e a finalidade fiscal; checagens de `null` explícitas; 3 erros de lint do WIP. Mantido e registrado em `decisions.md`: contas antigas sem CPF voltam a ver o passo "Seu cadastro"; lista de fornecedores sem paginação; código morto (`getSupplierForRegion`, `listNichesForRegion`); saúde do cliente no admin ainda não olha o CPF.
- Portões (banco descartável `sellbridge_wip`): lint, tipos, formatação, sem else ✅; testes 1140/1140 (shared 306, database 232); build ✅; e2e 25/25 (fornecedores, login, relatórios, acessibilidade, desativação do catálogo); M1 ✅ (banco novo), M3 ✅ (`when` maior que o da 0023); D2 sem rolagem nas 8 larguras em Fornecedores e Alterar seus dados; capturas desktop e celular nos dois temas conferidas.
- Aplicada no `sellbridge_desk`. Também entrou na branch, por outra sessão, `eaa99e9` (eixo de valores do gráfico do Financeiro mede o maior rótulo).

### 2026-10-14 · Consolidação: chat único, audit e correção do cabeçalho juntados

- O usuário encerrou os chats B, C, D e E: este chat passa a fazer todos os itens. B não tinha item feito (só 57706a5, portas do e2e, e o prompt de abertura); C já estava juntado (36ebac1); D e E não começaram.
- Branch `fix/numeric-bounds-audit` (10 commits, auditoria de sanitização, async, desempenho e segurança) trazida commit a commit (36a5aa3…0b98426), porque se sobrepunha ao trabalho já feito aqui (66 conflitos num merge direto). Regra usada: onde as duas versões resolviam o mesmo problema, fica a daqui; entra só o que é novo:
  - corpo lido com limite em bytes também para formulários (`readFormDataWithin`); imagens acima de 64 MP recusadas; eventos de webhook apagados depois de 30 dias; pedido de sync de estoque deduplicado;
  - unidades repostas vão primeiro para itens pagos em falta (`reserveShortItems`); nota do fornecedor ignora carrinhos nunca pagos; links de imagem e atributos do ML com limite;
  - pedido pendente não conta como receita (parte do item 09);
  - sino: venda antiga trazida pela primeira sincronização não aparece como nova;
  - `freeText()` ganhou NFC (um só auxiliar; o `safeText()` do audit foi trocado por ele); nomes sem caracteres bidirecionais; meia-surrogate UTF-16 recusada no webhook; anexos apagados se o chamado não grava; mensagens fixas do OAuth na tela de lojas;
  - `assertSameOrigin` nas rotas de API que mudam dados; chaves de API e webhooks com regras de cargo e de "entrar como cliente";
  - envio: uma ocorrência depois de "Enviado" não apaga mais a transportadora nem o rastreio; o link do fornecedor para de funcionar quando o pacote é entregue ou devolvido; reencaminhar para fornecedor desativado é recusado;
  - duas notificações simultâneas do mesmo pedido novo viram um pedido só; token antigo não expira loja reconectada;
  - entregas de webhook drenam lotes cheios na mesma execução; foco visível em links, cartões, gráficos e no botão de senha.
- Ficou de fora (já existia aqui de outro jeito, ou fica para o item dono): leitores de corpo, NUL no webhook, `MAX_PAGE`, `parseBrlToCents`, schemas do ML, guarda de status de pedido (a daqui permite voltar a "pago" quando o pacote não chega), sync em paralelo por loja (item 32.e), intervalo de atualização das publicações, poda de eventos da API.
- `nifty-elbakyan`: correção do transbordo de 21 px do cabeçalho em 1024 px (d205009), pendente desde o 01.b.
- `feat/publications-cards`: não juntada, porque já estava aqui consolidada em 112f446 (11/10).
- Portões: lint ✅, tipos ✅, formatação ✅, sem else ✅ (720 arquivos), testes 1125/1125 (base 858; web 392, shared 298, database 225, marketplaces 149, worker 54, scripts 7), build ✅ sem mudança no `routeTree.gen.ts`, e2e completos 78/78 em série (12,9 min).

### 2026-10-14 · Item 20.c · Filtros da Operação na URL e avaliação dentro do pedido — ✅ concluído (ffff29f, commit local)

- Busca enquanto digita, etapa, período ("Tudo" por padrão) e loja na URL; "Pedidos" volta aos filtros; página além do fim mostra a última. Cartão de avaliação do fornecedor na página do pedido, com a mesma regra da aba.

### 2026-10-14 · Item 08 · Produto ou fornecedor inativo e fora da região — ✅ concluído no chat C (b2a3331 · 2135a1b, junção 36ebac1)

- Sync manda estoque 0 para produto ou fornecedor inativo e fora da cobertura; publicação na fila de produto indisponível falha sem chamar o marketplace. Desativar pausa os anúncios na mesma transação (botão e CSV); reativar não reativa; o card e o sino explicam o motivo.

### 2026-10-13 · Item 20.a e 20.b · Página do pedido — ✅ concluído (bbf14fc · c6b7987, commits locais)

- `getOrderPage` reúne itens, dinheiro pela regra do Financeiro, histórico de status, envios e avaliações, só do tenant. `/pedidos/$orderId` segue a página do chamado; o número do pedido na Operação e os avisos do sino levam a ela.

### 2026-10-13 · Item 07 · Fornecedor não declara "entregue" sozinho — ✅ concluído (4b7eba9, commit local)

- O link para em "Enviado" e diz quem confirma a entrega; o servidor também recusa. O histórico guarda quem confirmou.

### 2026-10-13 · Item 06 · Envio cancelado e reencaminhamento — ✅ concluído (b68dbe5, commit local)

- Envio cancelado não segura o status do pedido; o pacote cancelado pode ser reenviado com link novo e histórico mantido; o sino avisa o revendedor até o reencaminhamento.

### 2026-10-13 · Item 05 · Migration 0008 pulada em bancos antigos — ✅ concluído (acb48dd, commit local)

- Migration 0021 repete a 0008 com cada comando protegido; teste de migrations refaz o histórico em bancos descartáveis (M1 e M2).

### 2026-10-13 · Item 04 · Status completos do pedido e do rastreio do ML — ✅ concluído (be3b6f1 · 50119db · ccab61f, commits locais)

- Mapa de status com fixtures de todos os status documentados; reembolsos viram um ajuste por pedido (migration 0020); pedido devolvido pelo pacote; status e linha do tempo do envio com os tons dos pedidos.

### 2026-10-13 · Item 02 · Anúncio duplicado e publicação travada — ✅ concluído (4925280 · d07b7e2 · 124372a, commits locais)

- Um anúncio por produto e loja, com trava por loja; publicação incerta destravada depois de 10 min quando a busca no ML não acha o item; acabamento das linhas de estoque e das lojas já ocupadas.

### 2026-10-13 · Item 01.c · Falta de estoque visível e reservado no admin — ✅ concluído (f78b913, commit local)

- Sino (aba Problemas): "Falta estoque para o pedido #X" com produto e o que fazer, enquanto o pedido pago tiver item `short`; some quando o estoque volta ou o pedido cancela. Pedidos › Operação: selo "Falta estoque" empilhado sob o status; o texto do pedido ganhou largura mínima e, no celular, status e botão descem (antes o texto ficava espremido numa coluna estreita). Admin: "22 · 2 reservados".
- Revisão independente: "Limpar tudo" escondia falta aberta e a falta usava a data do pedido (não contava como nova) → coluna `short_since` e falta isenta da limpeza (testes novos); limite agora agrupado por pedido no SQL, faltas mais antigas primeiro; filtro de tenant também em `orders`; admin mostra "faltam N" quando a reserva passa da prateleira.
- Migration 0018: `short_since` + índice parcial `order_items_short_idx`; M1 ✅, M2 ✅ (sobre o banco com dados, só a 0018), M3 ✅, `EXPLAIN` usa o índice.
- Vícios de IA corrigidos (a pedido): helper `alsoSoldBy` no lugar de setup duplicado, data de teste numa constante, teste que refazia a consulta do helper, `?? ""` trocado por checagem explícita, data da falta gravada no mesmo update do estado, tom âmbar do sino numa constante.
- Portões: lint, tipos, formatação, sem else ✅; 858 testes (base 848); build ✅; e2e 14 + 11 ✅ (sino, admin, operação, acessibilidade, stock).
- O aviso leva a `/pedidos` sem filtro (a busca da Operação não vive na URL); link direto virá com a página do pedido (item 20).
- Fora do escopo: quando a busca do sino falha no servidor, o painel mostra "Nenhum problema por aqui" em vez de um erro (`notification-bell.tsx`, falta `ErrorState`, regra V12); visto ao capturar com o servidor de desenvolvimento desatualizado.
- Dados de demonstração no `sellbridge_desk`: pedidos DEMO-FALTA-01C (em falta) e DEMO-RESERVA-01C (2 reservados).

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
