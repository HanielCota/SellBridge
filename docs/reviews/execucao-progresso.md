# Andamento da execução tela a tela

Registro vivo do prompt [execucao-tela-a-tela.md](../prompts/execucao-tela-a-tela.md). Cada sessão **lê este arquivo antes de começar** e **atualiza o bloco "Em andamento" ao terminar cada etapa** e a tabela ao terminar cada parte. É a memória entre sessões: o que não está aqui não aconteceu.

## Em andamento

- Item/parte: 21.b · Encaminhar sozinho (atrás de flag) e e-mail ao fornecedor
- Última etapa concluída: — (21.a fechado; antes da 21.b, junção do item 15 do C, do item 17 do B e da etapa 6 do CPF)
- Próximo passo: etapas 1–3 da 21.b e ⏸1
- Arquivos tocados: —
- Decisões tomadas nos pontos de parada: **3 chats desde 2026-10-15** (`docs/prompts/coordenacao.md` seção 0): este (envio e junção), B (contas e lojas), C (catálogo e dinheiro), mais o chat CPF (branch `feat/cpf-supplier-per-store`, banco `sellbridge_desk_d`, etapa 2 do fim da trava por região). C adia 13, 14, 18 e 23 até a etapa 2 entrar.
- Pendências: a 0023 cria `store_connections_live_shop_idx` sem tirar duplicados antes, então um banco antigo com a mesma loja viva em dois tenants não migra (achado do chat B no item 03; precisa de migration de limpeza ou nota de deploy); "trocar de fornecedor num envio cancelado"; lembrar o revendedor de confirmar entrega parada em "Enviado" (com o 22); mensagem de conflito do 02.a usa o nome bruto da loja; confirmar com conta de teste do ML se GET /shipments/{id} traz o endereço e o link da venda; tópicos shipments e post_purchase não assinados; ShipmentActions recebe ~13 props; sync em paralelo por loja do audit não trazido (fica para o 32.e); nome do cadastro guardado sem `trim` (o audit corrigia, ficou de fora por mexer no hook do Better Auth; ver item 10); **a recuperar das pastas antigas `.claude/worktrees/` (11/10, nunca commitadas)**: (1) o painel de atenção e o aviso do sino mandam "pedidos para avaliar" para `/pedidos` sem abrir a aba de avaliações (`attention-panel.tsx:86`, `notification-presenter.ts:117`) — bug real, de `pedidos-pending-filter`; (2) contraste do modo claro (`--brand-mark`, `--finance-gain`, `--ring` mais escuro, bolinhas de status, switch desligado visível), de `light-mode-verification`; (3) manter a rolagem ao trocar filtro (`resetScroll: false`), de `financeiro-page-reset-bug`; (4) seed mais completo (workspace do admin, clientes e chamados de exemplo), de `http-500-error-localhost`, precisa ser refeito para o schema atual; (5) opcionais: `useRevealActive`, `reviewHint`, foto que falha antes da hidratação, `ticket-diagnosis`. As outras 5 pastas antigas já estão no código ou foram descartadas por design

## Linha de base

| Métrica                                        | Valor                           | Medido em  |
| ---------------------------------------------- | ------------------------------- | ---------- |
| Testes unitários e de integração (`pnpm test`) | 1382 passando                   | 2026-10-15 |
| Testes web (`apps/web` vitest)                 | 536 passando                    | 2026-10-15 |
| E2E completos (`--workers=1`)                  | 97 passando                     | 2026-10-15 |
| Última migration                               | 0029_supplier_contact_deadlines | 2026-10-15 |
| Branch de trabalho                             | `feat/client-phase-1`           | 2026-10-12 |

## Situação dos itens

Legenda: ✅ concluído · 🟡 parcial · ⬜ não iniciado · ⛔ bloqueado (motivo na coluna Notas)

Itens com partes (seção 9.0 do prompt) registram cada parte na coluna Notas (ex.: `01.a ✅ abc1234 · 01.b ⬜`). O item só vira ✅ quando todas as partes estão ✅.

| Item | Título                                          | Situação | Commit                                | Notas                                                                  |
| ---- | ----------------------------------------------- | -------- | ------------------------------------- | ---------------------------------------------------------------------- |
| 00   | Preparação do dia                               | ✅       | 6ef08d0 · 6801888                     | Árvore herdada revisada duas vezes e commitada (local, sem push)       |
| 01   | Estoque: reserva e baixa na venda               | ✅       | b828b38 · 51273db · f78b913           | 01.a ✅ b828b38 · 01.b ✅ 51273db · 01.c ✅ f78b913                    |
| 02   | Anúncio duplicado e publicação travada          | ✅       | 4925280 · d07b7e2                     | 02.a ✅ 4925280 · 02.b ✅ d07b7e2 · acabamento 124372a                 |
| 03   | Mesma conta do ML em dois revendedores          | ✅       | 558cd66                               | Chat B; junção 3ff71ce                                                 |
| 04   | Status completos do pedido e do rastreio do ML  | ✅       | be3b6f1 · 50119db · ccab61f           | 04.a ✅ be3b6f1 · 04.b ✅ 50119db · 04.c ✅ ccab61f                    |
| 05   | Migration 0008 pulada em bancos antigos         | ✅       | acb48dd                               |                                                                        |
| 06   | Envio cancelado e reencaminhamento              | ✅       | b68dbe5                               |                                                                        |
| 07   | Fornecedor não declara "entregue" sozinho       | ✅       | 4b7eba9                               |                                                                        |
| 08   | Produto ou fornecedor inativo e fora da região  | ✅       | b2a3331 · 2135a1b                     | Feito no chat C; 08.a ✅ b2a3331 · 08.b ✅ 2135a1b (junção 36ebac1)    |
| 09   | Lucro correto                                   | ✅       | 92d2e56 · 7772cb6                     | Chat C; receita só de pagos (118406a) e custo pendente; junção 8e4f821 |
| 10   | Segurança de contas e da equipe                 | ✅       | 6c32358 · c29dbc8 · 7bd26d1 · 3742f08 | Chat B; 10.a ✅ · 10.b ✅ · 10.c ✅                                    |
| 11   | Uploads seguros                                 | ✅       | 3859be6                               | Chat B; junção dd74a79                                                 |
| 12   | Admin muda a região e apaga o endereço          | ⬜       | —                                     |                                                                        |
| 13   | Erros de publicação claros                      | ⬜       | —                                     |                                                                        |
| 14   | Publicação em massa: validação e progresso      | ⬜       | —                                     |                                                                        |
| 15   | Uma regra só de taxa e margem                   | ⬜       | —                                     |                                                                        |
| 16   | Riscos da assinatura                            | ⬜       | —                                     |                                                                        |
| 17   | Link do fornecedor e diagnóstico                | ⬜       | —                                     |                                                                        |
| 18   | CSV com atributos do Mercado Livre              | ⬜       | —                                     |                                                                        |
| 19   | Pequenos de segurança e status                  | ⬜       | —                                     |                                                                        |
| 20   | Página do pedido                                | ✅       | bbf14fc · c6b7987 · ffff29f           | 20.a ✅ bbf14fc · 20.b ✅ c6b7987 · 20.c ✅ ffff29f                    |
| 21   | Encaminhamento automático e aviso ao fornecedor | ⬜       | —                                     | Depende de D6                                                          |
| 22   | Rastreio automático e previsão                  | ✅       | 424f7bd · (22.b)                      | 22.a ✅ 424f7bd · 22.b ✅                                              |
| 23   | Anúncios completos                              | ⬜       | —                                     |                                                                        |
| 24   | Saúde das lojas                                 | ⬜       | —                                     |                                                                        |
| 25   | Central de notificações                         | ⬜       | —                                     | WhatsApp depende de D9                                                 |
| 26   | Onboarding previsível e conta completa          | ⬜       | —                                     |                                                                        |
| 27   | Suporte: o que falta                            | ⬜       | —                                     |                                                                        |
| 28   | Admin da plataforma                             | ⬜       | —                                     |                                                                        |
| 29   | Painel do mockup do cliente                     | ⬜       | —                                     | Layout depende de D8                                                   |
| 30   | LGPD e proteção da conta                        | ⬜       | —                                     |                                                                        |
| 31   | Planos como no PDF                              | ⬜       | —                                     | Depende de D10                                                         |
| 32   | Infra                                           | ⬜       | —                                     |                                                                        |
| 33   | Shopee                                          | ⛔       | —                                     | Sem credenciais de parceiro                                            |
| 34   | Pagamento ao fornecedor (split e custódia)      | ⛔       | —                                     | Depende de D1–D4                                                       |
| 35   | Conquistas digitais e Club                      | ⛔       | —                                     | Depende de decisão do cliente                                          |
| 36   | IA assistente                                   | ⛔       | —                                     | Depende de decisão do cliente                                          |
| 37   | Fiscal e contabilidade                          | ⛔       | —                                     | Depende de decisão contábil                                            |

## Histórico

Uma entrada por item concluído ou interrompido, a mais recente em cima, no formato da seção 7 do prompt (resumo).

### 2026-10-15 · Junção: item 15 do C, item 17 do B e etapa 6 do CPF

- Item 15 do chat C (`cb6fdf9`: 15.a `c04e2b2`, 15.b `f4dc995`): prévias com todas as taxas e piso de preço no servidor (`MIN_MARGIN_PERCENT`, padrão 0).
- Item 17 do chat B (`93b97c3`, log `9f6c701`): o token do fornecedor sai das URLs (etiqueta por POST, `?token=` dá 400) e o diagnóstico tem limite por cliente.
- Etapa 6 do CPF (`1fc4c5c`, junção `a5cdcd5`): admin de Clientes com titular (CPF informado ou pendente, sem o número) e troca do fornecedor de uma loja.
- Conflitos: só o fim de `docs/decisions.md`, com as seções dos dois lados mantidas. Nenhuma migration nova.
- Portões: lint, tipos, formatação, sem else ✅; testes 1382/1382; build ✅; e2e completo em série 97/97 (21 min).

### 2026-10-15 · Item 21.a · Contato e prazos do fornecedor — ✅ concluído (commit local)

- Cadastro do fornecedor ganha o bloco "Pedidos": e-mail para pedidos (opcional, só a equipe vê) e prazos para aceitar e despachar, em horas (padrão 24 h e 48 h, de 1 a 720, aceite não passa o despacho). Migration 0029 em commit separado.
- Portões: lint, tipos, formatação, sem else ✅; testes 1364/1364; build ✅; M1, M2 (sem diferença no `generate`) e M3 ✅; e2e 2/2 (`admin-suppliers`); D2 sem rolagem nas 8 larguras; 8 capturas (dois temas, celular e desktop, com e sem erro).

### 2026-10-15 · Item 22.b · Previsão e atraso nas telas — ✅ concluído (commit local)

- Painel de envio com "Despachar até" / "Entrega prevista" e o aviso de atraso; Operação com o aviso sob o status; sino com `shipment_late` em Problemas. Cálculo no servidor (`repositories/shipment-timing.ts`). Junto: a linha de links do envio quebra no celular e a página do pedido ganhou `grid-cols-1` (rolava 100 px em 320 px).
- Portões: lint, tipos, formatação, sem else ✅; testes 1350/1350; build ✅; e2e 17/17; D2 sem rolagem nas 8 larguras; 12 capturas.

### 2026-10-15 · Junção: item 11 do chat B (uploads seguros)

- dd74a79 (commit 3859be6): o chamado é conferido antes de gravar anexo (outro tenant 404, encerrado 409, nada no disco); anexo que falha no meio apaga o que já gravou; limite em memória de 30 mensagens com arquivo e 10 fotos a cada 10 min por conta (429, código `RATE_LIMITED`). Conflito só no fim de `decisions.md` (blocos mantidos).
- Portões: tipos, lint ✅; testes 1345/1345; build ✅; e2e 17/17 (suporte, perfil, admin, entrar como cliente, acessibilidade).

### 2026-10-15 · Item 22.a · Rastreio automático no servidor — ✅ concluído (commit local)

- Worker lê a cada 30 min os envios do ML a caminho (fila `shipment-tracking`, 100 por vez, o lido há mais tempo primeiro, falha vai para o fim da fila, token recusado expira a loja); migration 0028 (`estimated_delivery_at`, `dispatch_deadline_at`, `tracked_at`, índice parcial `NULLS FIRST`); conector lê `lead_time` nó a nó; regra de atraso em `shared/domain/shipment-delay.ts` (dia inteiro em São Paulo). Tópico `shipments` ficou de fora (ver `decisions.md`).
- Revisão independente: 1 alto (token ilegível derrubava a tarefa) e 5 médios corrigidos, 3 recomendações aplicadas.
- Portões: lint, tipos, formatação, sem else ✅; testes 1332/1332; build ✅; M1, M2 (8 envios antigos) e M3 ✅; e2e 15/15.

### 2026-10-15 · Junção: parte de lojas do 10.c (chat B) — item 10 completo

- fb91d4e (commit 3742f08): durante o "entrar como cliente", o OAuth recusa conectar loja (`/lojas?erro=impersonating`) sem criar state nem chamar o marketplace; Reconectar, Desconectar e "Adicionar loja" ficam travados com o motivo (`stores-lock.tsx`).
- Portões: tipos, lint ✅; testes 1320/1320; build ✅; e2e 25/25 (entrar como cliente, mensagens de lojas, loja e fornecedor, fornecedores, publicação, acessibilidade).

### 2026-10-15 · Junção: etapa 5 do chat CPF (filtros por UF e cidade, "Vender este fornecedor")

- 5c73a2b (commit a6360cc): Fornecedores com Estado ("Todo o Brasil") e Cidade (cidade sem diferenciar acento e maiúscula), "Limpar filtros" no vazio; página do fornecedor com "Vender este fornecedor" → `/lojas?fornecedor=<id>#adicionar-loja`; o seletor do onboarding filtra UF no servidor. Sem migration.
- Portões: lint, tipos, formatação, sem else ✅; testes 1318/1318; build ✅; e2e 31/31 (fornecedores, loja e fornecedor, publicação, acessibilidade, mensagens de lojas, login); capturas do chat CPF conferidas (filtro MG + Belo Horizonte mostra só a BH Beauty).

### 2026-10-15 · Junções: 0027 e etapa 4 (chat CPF), 10.c (chat B) e 15.a (chat C)

- 0027 (f434f7e): `oauth_states.supplier_id`. Etapa 4 (e7dda98, commit 1dd4647): cada loja vende um único fornecedor; a primeira herda o do onboarding, as seguintes pedem a escolha; "Trocar fornecedor" pausa os anúncios do anterior sem apagar; publicação (individual, em lote, API e worker) só vai para loja do fornecedor do produto. Cores `violet`/`amber` cruas seguem o padrão já existente dos menus e avisos — entram na correção D-1 (tokens de sucesso, aviso e informação).
- 10.c sem a parte de lojas (93eb43b, commit 7bd26d1): no "entrar como cliente", 9 ações sensíveis recusadas pelo nome da função no `tenantMiddleware` e as demais escritas registradas com o admin; janela de 1 h conferida no servidor; troca de e-mail pela equipe exige reconfirmação e avisa o e-mail antigo. A parte de lojas vem por cima.
- 15.a (f468e1b, commit c04e2b2): um modelo de taxa em `shared/domain/fee-model.ts`, usado no Financeiro e na prévia. Conflito só no fim de `decisions.md` (seções mantidas).
- Portões: e2e completos 91/91 em série depois da etapa 4; depois de 10.c e 15.a: lint, tipos, formatação, sem else ✅, testes 1316/1316, build ✅, e2e 38/38 (entrar como cliente, admin, dono, segurança da conta, integrações, webhooks, cobrança, suporte, relatórios, custo pendente, loja e fornecedor, acessibilidade).

### 2026-10-15 · Junção: etapa 3 do chat CPF (onboarding com CPF e escolha do fornecedor)

- 6b29979 (commit da etapa 9fb280a): onboarding em 2 passos, "Seus dados" (nome e CPF, salvo na hora, CPF repetido recusado) e "Seu fornecedor" (busca, filtro por UF, cartões com reputação, barra fixa no rodapé); "Alterar seus dados" com "Trocar fornecedor"; o passo de endereço e o `?cep=` do cadastro saíram; guia com 4 passos (`hasHolder` + `hasSupplier`). `resolveCep` fica para o endereço do comprador e o admin.
- Portões na pasta principal: lint, tipos, formatação, sem else ✅; testes 1235/1235; build ✅; e2e completos 89/90 em série — a falha foi `ERR_CONNECTION_REFUSED` na porta 3100 (servidor de teste caiu por um instante) e o `admin-suppliers.spec` passou sozinho em seguida; D2 sem rolagem nas 8 larguras em onboarding e painel (o chat CPF mediu 5; completei 414, 1024 e 1920); capturas do chat CPF conferidas (21, dois temas, celular e desktop).

### 2026-10-15 · Junções: migration 0026 (chat CPF) e item 09 (chat C)

- 0026 (7595f78): `tenant_profile.starter_supplier_id`, o fornecedor escolhido no onboarding; aplicada no `sellbridge_desk`, senha liberada. Próxima livre: 0027.
- Item 09 (8e4f821, commits 92d2e56 e 7772cb6 do chat C): item sem custo do catálogo vira "custo pendente", fora do lucro, no servidor, no CSV, na API pública e nas telas (Financeiro, gráfico, Painel e página do pedido). Conflito só no fim de `decisions.md` (duas seções mantidas).
- Correção minha: o `fulfillment.spec.ts:95` ainda esperava o título antigo "Ordem de fornecimento" no link do fornecedor e só passava quando pegava o carregamento; agora espera "Pedido …" (a8e49d2). Achado pelo chat C.
- Portões: tipos, lint ✅; testes 1233/1233; build ✅; e2e 27/27 (custo pendente, relatórios, página do pedido, envio, acessibilidade).

### 2026-10-15 · Junções: 10.a e 10.b (chat B) e etapa 2 do chat CPF (fim da trava por região)

- 10.a (564a6f4): dono da plataforma (`ADMIN_EMAILS` + e-mail verificado + admin) protegido no hook do Better Auth em 11 rotas `/admin/*`; ficha do cliente com selo "Dono da plataforma". 10.b (8d9fe76): por HTTP, `/api/auth/admin/*` responde 404, exceto entrar e sair como cliente.
- Etapa 2 do chat CPF (b387940): catálogo, publicação, busca e API pública sem `requireTenantRegion`; `supplier-coverage` virou `sellable` (produto e fornecedor ativos); fornecedores sem selo, filtro e aviso de região, com "Publicar" para qualquer fornecedor ativo; sem `outside_region` no sino.
- Portões na pasta principal: lint, tipos, formatação, sem else ✅; testes 1213/1213; build ✅; e2e completos 85/85 em série (16,4 min) antes do 10.b e 4/4 do 10.b depois; D2 sem rolagem nas 8 larguras em Fornecedores e Catálogo; 12 capturas conferidas.
- Achados: o `stock.spec` disputa com o `catalog-deactivation` quando roda em paralelo (avisado ao chat C); o banco `sellbridge_desk` acumulou fornecedores de teste ("Fornecedor W-1", "Fornecedor de teste F4", nicho "Teste") que aparecem nas telas — limpar antes de capturas de entrega.

### 2026-10-15 · U-9 (com U-3 e U-4) · Link do fornecedor com marca, título, carregando e alerta — ✅ concluído (commit local)

- U-3 e U-4 já estavam resolvidos pelo 20.c (ffff29f): abas com `FilterTabs` e visão na URL; `Select` do projeto, busca enquanto digita, filtros na URL e `EmptyState`.
- U-9: `BrandLogo` e "Portal do fornecedor" no topo sobre `bg-surface-grouped` (como `LegalPage`); h1 "Pedido {número}"; esqueleto no formato do painel de envio; pedido com pagamento retido mostra `Alert` destrutivo com título e texto.
- Portões: lint, tipos, formatação, sem else ✅; 1160 testes; build ✅; e2e 10/10 (envio, acessibilidade); D2 sem rolagem e nada a menos de 16 px da borda nas 8 larguras; 9 capturas.

### 2026-10-15 · X-1 e X-3 · Confirmação de "Cancelar envio" e ocorrência vazia — ✅ concluído (562739e, commit local)

- "Cancelar envio" (link do fornecedor e "Operar pedido") abre `ConfirmDialog` com "Motivo do cancelamento" obrigatório, preenchido com a ocorrência já digitada, botões "Voltar" e "Cancelar envio" e texto conforme quem cancela. "Registrar ocorrência" vazio mostra "Escreva a ocorrência antes de registrar" (`role="alert"`). `ConfirmDialog` ganhou `cancelLabel`; `ShipmentActions` recebe o objeto do `useShipmentUpdate` (fim das ~13 propriedades).
- Portões: lint, tipos, formatação, sem else ✅; 1147 testes; build ✅; e2e 14/14 (envio 7, página do pedido, acessibilidade) e, depois da 0025, 24/24; D2 sem rolagem nas 8 larguras do link do fornecedor; 9 capturas.
- Junções do dia neste chat: item 03 do chat B (3ff71ce); migration 0025 do chat CPF (41e89ad, `store_connections.supplier_id`, endereço opcional, CPF único). Chat CPF (branch `feat/cpf-supplier-per-store`, banco `sellbridge_desk_d`) faz a etapa 2 (fim da trava por região), aprovada pelo usuário; o chat C adia 13, 14, 18 e 23 até ela entrar.

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
