# Lacunas: o que o cliente pede × o que o SellBridge tem

Data: 2026-10-12 · Branch: `feat/region-map-onboarding` (escrito sobre `6ea80ff`; **atualizado depois do merge da `main`, veja a seção ⟳**) · Prompt de execução: [docs/prompts/fase-cliente-1.md](../prompts/fase-cliente-1.md)

**Fontes do cliente**

- `SellBridge_Plano_Mestre_Completo_WhatsApp.pdf`: 7 páginas com MVP, diferenciais, o que fazer/integrar/segurar, planos, Club & Experience e roadmap.
- Áudio de 11/10, 08:40: pagamento com split e liberação na entrega.
- Áudio de 11/10, 11:18: previsibilidade, tempo, rastreio e aviso de venda.
- `SellBridge - Apresentação.pdf`: é a nossa apresentação do que já existe e serve só como referência.

**Como ler**

- Cada bloco traz o que o cliente pediu, a prioridade e as perguntas que precisam de resposta antes de implementar.
- Cada pergunta tem um status conferido no código:
  - ✅ **TEM**
  - 🟡 **PARCIAL**
  - ❌ **NÃO TEM**
  - ❓ **DECISÃO**: depende de resposta do cliente ou do time; não implementar no escuro.
- Prioridades:
  - **P0**: bloqueia a primeira venda real ou causa perda de dinheiro ou dados.
  - **P1**: tração (1→100 clientes).
  - **P2**: confiança (100→500).
  - **P3**: escala (500+).
  - **Fora**: o cliente vetou.

---

## ⟳ Atualização de 2026-10-12, depois do merge da `main` (HEAD `c332f8c`)

Este relatório foi escrito sobre `6ea80ff`. A `main` trouxe 38 commits que mudam vários status:

- pedido ao fornecedor por link e etiqueta do Mercado Livre;
- cadastro e importação de fornecedores no admin;
- assinatura via Stripe;
- atributos do Mercado Livre;
- health check e Docker;
- registro de erros.

A tabela abaixo vale **por cima** das seções seguintes. Um ID que não aparece aqui continua como está na sua seção.

| ID                 | Agora            | O que mudou / o que falta                                                                                                                                                                                     |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2                 | ✅ (13/10)       | Conciliação por `seller_custom_field`/SKU e `creation_started_at`. Fluxo individual bloqueia produto já publicado na loja (02.a); criação incerta destrava após 10 min sem anúncio encontrado (02.b, 13/10).  |
| B4 / A7            | ✅ (13/10)       | Status do pedido e do envio do ML mapeados com fixtures (04.a): fraude retida, envio não entregue e devolvido. Reembolsos e devoluções no dinheiro (04.b). Selo e linha do tempo do envio (04.c).             |
| B5                 | ✅ (13/10)       | Migrations versionadas. A 0021 repete a 0008 com guardas, para bancos que a pularam por causa do `when` da 0007; teste de migrations em bancos descartáveis (M1 e M2) roda no `pnpm test`.                    |
| B9                 | ✅ (13/10)       | Desativar produto ou fornecedor pausa os anúncios de todos os revendedores e avisa no sino; reativar não reativa sozinho; sync manda 0 (08.a, 08.b). Auditoria vai para o 28.                                 |
| B10 / G4           | ✅ (15/10)       | Receita só de pedidos pagos (118406a). Item sem produto do catálogo vira "custo pendente": receita conta, lucro não (09.b), com aviso nas telas (09.c).                                                       |
| B17 / E6 / E7      | ✅ (15/10)       | Prévia = Financeiro com todas as taxas (15.a, 15.b); piso de preço com margem mínima configurável ao criar, editar e em massa (15.b).                                                                         |
| E11 / B13          | ✅ (16/10)       | Erros do ML com cause[] em português (13.a); descrição recusada vira aviso no card com reenvio e 3 tentativas automáticas (13.b).                                                                             |
| B16 / E8 / E12     | 🟡 (16/10)       | Massa com as regras do individual e sem estoque bloqueado nos dois fluxos; pulados com motivo (14.a). Falta progresso e tela (14.b, 14.c).                                                                    |
| A1, A2, A3         | 🟡               | `order_shipments`: um envio por pedido e fornecedor, com estados forwarded→…→delivered/cancelled. O fornecedor recebe um link com token de 30 dias. O encaminhamento é manual e o link é compartilhado à mão. |
| A4, A10            | 🟡               | O fornecedor cancela com motivo. Não cancela no ML, não estorna, não avisa e não deixa reencaminhar.                                                                                                          |
| A6, A11            | ✅ (14/10)       | Página `/pedidos/$id` (20.b) com avaliação do fornecedor (20.c). Aba "Operação" com busca, etapa, período e loja no endereço: voltar do pedido mantém os filtros (20.c).                                      |
| A8                 | 🟡               | Varredura reenfileira webhooks não processados. Sem polling no ML.                                                                                                                                            |
| A9                 | ✅               | Separação por fornecedor com índice único.                                                                                                                                                                    |
| B-1, K6            | 🟡               | CRUD de fornecedores e produtos em `/admin/fornecedores`, só para admin. Faltam categorias, exclusão e auditoria.                                                                                             |
| B-5                | ✅ (admin)       | Formulário e CSV com prévia. Sem autosserviço do fornecedor.                                                                                                                                                  |
| B-6                | 🟡               | Até 20 fotos e atributos do ML livres. Sem colunas de EAN, peso, dimensões, variações e NCM; o CSV não aceita atributos.                                                                                      |
| B-7                | 🟡               | Estoque atualizado à mão pelo admin, disparando o sync.                                                                                                                                                       |
| B-15               | 🟡               | Página do link do fornecedor com etapas, rastreio e etiqueta. Sem painel consolidado.                                                                                                                         |
| C3, C6, C12        | 🟡 só assinatura | Stripe usado direto para a **mensalidade**. Pagamento ao fornecedor, split e custódia (C1–C11) continuam ❌.                                                                                                  |
| D-1, D-2, D-3      | 🟡               | Envio do ML consultado por botão manual; etiqueta ME2 em PDF; linha do tempo do envio. Sem tópico `shipments`, sem previsão, e pedido dividido fica sem etiqueta.                                             |
| D-7                | 🟡               | "Entregue" grava `deliveredAt` e libera a avaliação; só o Mercado Livre ou o revendedor o confirmam (item 07). Não libera pagamento.                                                                          |
| E3                 | 🟡               | Atributos obrigatórios validados antes do POST. O preenchimento é manual e a categoria continua adivinhada.                                                                                                   |
| E13, M1, M2, M4–M7 | 🟡               | Três planos (Gratuito 2/25, Pro 10/500, Business 50/5000), Stripe Checkout e Portal, limite de lojas e anúncios no servidor, página `/assinatura`. Diverge dos 5 planos do PDF.                               |
| G1                 | ✅               | `sale_fee` tratado como valor por unidade.                                                                                                                                                                    |
| H7                 | 🟡               | E-mail HTML com marca só na autenticação; o do suporte segue em texto.                                                                                                                                        |
| I5                 | 🟡               | Linha do tempo do envio, sem previsão de tempo.                                                                                                                                                               |
| L6, L8             | 🟡               | Rate limit de auth em produção, headers de segurança e HSTS, tags de prévia, CEP vindo da landing externa. `/` ainda redireciona.                                                                             |
| Q6                 | 🟡               | A landing existe fora deste repositório.                                                                                                                                                                      |
| R1                 | 🟡               | Registro estruturado de erros do servidor e do navegador. Sem Sentry nem alertas.                                                                                                                             |
| R2                 | ✅               | `/api/health` e Dockerfile com HEALTHCHECK e migrate no boot.                                                                                                                                                 |
| B1 / B-8           | ✅ (13/10)       | Reserva na venda (prateleira + reservado), sync imediato, estoque de segurança, falta visível ao revendedor (sino e Operação) e reservado no admin. Itens 01.a–01.c.                                          |
| B-9                | ✅ (13/10)       | "Atualizado há X" no catálogo e na página do fornecedor (`ProductStockLine`).                                                                                                                                 |
| J5                 | 🟡 (13/10)       | Pedidos vinculados ao chamado (`ticket_orders`, migration 0016), visíveis ao revendedor e à equipe. Faltam loja e anúncio, e o botão "Falar com o suporte" nas telas de pedido, loja e anúncio (item 27.a).   |
| B3                 | ✅ (14/10)       | Uma loja do marketplace fica em uma organização por vez: índice único (0023) e recusa também na conexão simultânea, com a mesma mensagem (item 03). O webhook acha só o dono atual.                           |
| B7                 | ✅ (15/10)       | 10.a dono gerencia a equipe; 10.b rotas cruas /admin/* fechadas; promoção a dono apaga senha e logins sociais (10.c).                                                                                         |
| B18 / K5           | 🟡 (15/10)       | Entrar como cliente: 1 h, fim registrado, ações bloqueadas e o resto com o nome do admin (10.c). Falta conectar loja.                                                                                         |
| B19                | ✅ (15/10)       | E-mail trocado pelo admin volta a não confirmado, com link ao novo, aviso ao antigo e auditoria (10.c).                                                                                                       |
| B11 / J17          | ✅ (15/10)       | Teto do corpo antes de ler; chamado conferido antes de gravar anexo; limite de envios por conta (429). S3/R2 fica no 32.c.                                                                                    |
| N11                | ✅ (15/10)       | Token do fornecedor só no próprio link: leitura do envio por POST e etiqueta por formulário POST; ?token= recusado (item 17).                                                                                 |
| N12                | ✅ (15/10)       | Diagnóstico com limite por cliente (30/min) e teto total (600/min), em vez de um contador global (item 17).                                                                                                   |
| B20                | ✅ (15/10)       | `redirect` do login e do onboarding aceita só caminho interno; `//host`, `/\host` e esquemas são descartados (item 19).                                                                                       |
| B15                | ✅ (15/10)       | Falha de renovação que não é de autorização deixa a loja conectada em "Atenção" no card, com o motivo; sem gravar `error`, para seguir tentando (item 19).                                                    |
| B8 / N6            | ✅ (14/10)       | Organização sem criação nem exclusão, /organization/* fechado por HTTP e membro reconferido em requireTenantSession (audit + 10.b).                                                                           |

### Decisões do cliente que o código já assumiu (confirmar com ele)

- **D3 (parcial):** Stripe só para a mensalidade. O gateway do split segue aberto.
- **D10:** três planos com um **Gratuito**, contra os cinco planos pagos do PDF (R$ 97 a R$ 997).
- **D2:** a receita na prática é só a mensalidade. Não há taxa de 4%.
- **D6:** o fornecedor trabalha sem login, por um link com token que o revendedor compartilha.
- **D5:** dropshipping direto, com a etiqueta ME2 da conta do revendedor.
- **D4 (parcial):** fornecedor, revendedor ou ML podem declarar "entregue". Ainda não há regra de dinheiro.

### Riscos novos trazidos pela `main` (N1–N14)

| #   | Grav. | Problema                                                                                                                                                   | Onde                                              |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| N1  | 🔴    | Migration 0008 pulada em bancos antigos (ver B5).                                                                                                          | `migrations/meta/_journal.json`                   |
| N2  | 🔴    | Trava de publicação permanente: `creation_started_at` só é limpo em recusa 4xx. Um timeout ou 5xx deixa o anúncio para sempre em "só conciliar".           | `mercado-livre/listings.ts`, `publish-listing.ts` |
| N3  | ✅    | Envio cancelado não conta para o status do pedido e pode ser reencaminhado ao mesmo fornecedor (item 06, 13/10).                                           | `fulfillment-status.ts`, `fulfillment.ts`         |
| N4  | ✅    | Pelo link, o fornecedor só avança até "Enviado"; a entrega é confirmada pelo Mercado Livre ou pelo revendedor, com a origem no histórico (item 07, 13/10). | `shared/schemas/fulfillment.ts`, `fulfillment.ts` |
| N5  | 🟠    | Chamadas ao Stripe dentro de transação com lock da organização: bloqueiam publicação e conexão de loja do tenant por até 45 s.                             | `billing.server.ts`, `webhook.server.ts`          |
| N6  | 🟠    | Limite de plano contornável: o plugin `organization()` exposto (B8) cria organizações com cota nova.                                                       | `auth.ts`                                         |
| N7  | 🟠    | A cota conta todos os anúncios, inclusive falhos e encerrados, e não há exclusão.                                                                          | `repositories/billing.ts`                         |
| N8  | 🟠    | Sem as variáveis do Stripe, produção roda sem limite nenhum.                                                                                               | `publish-listing.server.ts`, `oauth.server.ts`    |
| N9  | 🟡    | `past_due` volta na hora para o Gratuito, sem carência.                                                                                                    | `shared/domain/billing.ts`                        |
| N10 | ✅    | Desativar pausa os anúncios, avisa no sino e dispara sync (08.b). Auditoria do catálogo fica para o item 28.                                               | `suppliers.server.ts`                             |
| N11 | 🟡    | O token do fornecedor vai em query string (etiqueta e GET) e vaza para logs um link de 30 dias com o endereço do comprador.                                | `fornecedor/pedido/$token.tsx`                    |
| N12 | 🟡    | O endpoint de diagnóstico tem limite global de 60/min: um cliente cala os relatórios de todos.                                                             | `error-reports.ts`                                |
| N13 | 🟡    | Não entregue, cancelado e devolvido mapeados (04.a, 13/10). Ainda só atualiza com clique (tópico `shipments` não assinado).                                | `fulfillment.ts`                                  |
| N14 | 🟡    | O CSV não aceita atributos do ML: catálogo importado em massa falha na publicação.                                                                         | `product-csv.ts`                                  |

---

## 0. Decisões que precisam do cliente (bloqueiam P0/P1)

| #   | Pergunta                                                                                                                                                       | Por que bloqueia                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| D1  | A taxa é **4% sobre o valor do pedido** do revendedor ao fornecedor? O exemplo do áudio ("pagou 10, vem 4, sobra 16") não fecha.                               | Define o cálculo do split.                     |
| D2  | Os 4% são cobrados **além da mensalidade** ou no lugar dela, em algum plano?                                                                                   | Define o modelo de receita e a tela de planos. |
| D3  | Qual **gateway**? Asaas, Pagar.me, Iugu e Mercado Pago fazem Pix + cartão + split + custódia. Quem abre a conta: a plataforma e cada fornecedor como subconta? | Integração de pagamento e KYC do fornecedor.   |
| D4  | **Quando libera** o dinheiro ao fornecedor? No status "entregue" do marketplace? E com devolução, prazo de arrependimento de 7 dias ou disputa?                | Regra de custódia.                             |
| D5  | Quem paga o **frete** do fornecedor ao comprador final? O envio sai do fornecedor direto ao comprador (dropshipping) ou passa pelo revendedor?                 | Define todo o fluxo logístico.                 |
| D6  | O fornecedor **usa o SellBridge**, com login e painel próprios, ou os pedidos chegam a ele por WhatsApp/e-mail operados pelo nosso time?                       | Define se existe o "portal do fornecedor".     |
| D7  | O menu **"Clientes"** do mockup são os compradores finais do revendedor?                                                                                       | Página nova ou não.                            |
| D8  | As telas do PDF (menu lateral, "Olá, Carlos", rosca de categorias) são **layout obrigatório** ou direção visual?                                               | Escopo de redesign.                            |
| D9  | Canal de aviso: **WhatsApp oficial (Cloud API, pago por conversa)**, push do PWA ou os dois?                                                                   | Custo e integração.                            |
| D10 | Os 5 planos: **qual recurso entra em qual plano** (nº de lojas, anúncios, usuários, fiscal, IA)?                                                               | Recursos liberados por plano.                  |
| D11 | Quem são as **equipes internas** do SellBridge (suporte, supervisão, financeiro, comercial) e o que cada uma pode fazer?                                       | Modelo de cargos (bloco J/K).                  |

---

## 1. Bugs e riscos já existentes (corrigir antes de construir em cima)

Ordenados por gravidade. Todos foram conferidos no código.

| #   | Grav. | Problema                                                                                                                                                                                  | Onde                                                                                                      |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| B1  | 🔴    | **Venda sem estoque (overselling) estrutural**: o estoque do fornecedor nunca baixa na venda e é replicado cheio para todas as lojas de todos os revendedores da região.                  | `packages/database/src/repositories/listings.ts:339-375`, nenhum `update(supplierProducts)` fora de teste |
| B2  | 🔴    | **Anúncio duplicado no ML**: o fluxo individual não checa se o produto já foi publicado, e o Reprocessar após "interrompida" recria o item (TODO de idempotência no `POST /items`).       | `listing-commands.server.ts:28`, `mercado-livre/listings.ts:86-91`                                        |
| B3  | 🔴    | **Webhook entre tenants**: a mesma conta ML em dois tenants passa por `findConnectedStoreByShop` (`findFirst` sem tenant), e o pedido cai no tenant errado.                               | `repositories/webhooks.ts:71-84`                                                                          |
| B4  | 🔴    | **Pedidos reais do ML nunca passam de paid/cancelled**: não há shipped/delivered/returned, `deliveredAt` nem avaliação de fornecedor.                                                     | `mercado-livre/orders.ts:10-20`                                                                           |
| B5  | 🔴    | **Migrations 0009–0011, `schema/admin.ts` e outros arquivos fora do git**, e o `_journal.json` reescreveu o `when` da 0007 (já aplicada). Risco de deploy quebrado ou migração pulada.    | `packages/database/drizzle/*`, `git status`                                                               |
| B6  | 🟠    | **Rebaixar um admin da `ADMIN_EMAILS` se desfaz sozinho**: o hook repromove a conta, apaga a senha e derruba todas as sessões.                                                            | `lib/server/auth.ts:190-229` + `customers.functions.ts:215`                                               |
| B7  | 🟠    | **Qualquer admin bane, rebaixa ou remove outro admin.** `/api/auth/admin/remove-user`, `set-user-password` e `create-user` ficam expostos e sem auditoria.                                | `customers.functions.ts:84`, plugin admin                                                                 |
| B8  | 🟠    | **Plugin `organization()` exposto**: qualquer usuário cria organização e convida membros pela API. `requireTenantSession` confia em `activeOrganizationId` sem reconferir a participação. | `auth.ts:296`, `tenant-session.ts:373-375`                                                                |
| B9  | 🟠    | **Produto ou fornecedor inativo, ou fora da nova região, continua anunciado e sincronizando.**                                                                                            | `findTargetsNeedingSync` em `listings.ts:348-375`                                                         |
| B10 | 🟠    | **Lucro inflado**: item de anúncio não vinculado entra com custo 0; pedidos `pending` contam como receita.                                                                                | `repositories/orders.ts:143`, `sql/counted-orders.ts`                                                     |
| B11 | 🟠    | **Uploads sem teto de corpo**: `formData()` é lido inteiro antes de checar o tamanho, e anexos são gravados antes de validar posse e status do ticket (arquivos órfãos).                  | `support.server.ts:43-45,97`, `avatar.server.ts`                                                          |
| B12 | 🟡    | O admin altera a região e **apaga rua, número e complemento** do cliente (não commitado).                                                                                                 | `customers.functions.ts:293-303` + `repositories/region.ts:86-105`                                        |
| B13 | 🟡    | Falha ao gravar a descrição no ML é **engolida**: o anúncio fica sem descrição e aparece como "Publicado".                                                                                | `mercado-livre/listings.ts:54-77`                                                                         |
| B14 | ✅    | **Corrigido em 2026-10-12** (`ticket_reads`). Era: resposta de suporte com status `open`/`closed` **não notifica** o cliente. O "não lido" é o status, não a leitura.                     | `repositories/notifications.ts:192-203`                                                                   |
| B15 | 🟡    | Status `error` da loja nunca é gravado: uma falha 5xx no refresh deixa a loja como "Conectada".                                                                                           | `token-refresh.ts:54`                                                                                     |
| B16 | 🟡    | A publicação em massa **pula a validação de título e descrição** do fluxo individual. O toast de "já publicados" esconde produtos descartados por região ou inatividade.                  | `catalog.functions.ts:77-85`, `bulk-publish-dialog.tsx:422`                                               |
| B17 | 🟡    | A prévia de margem (taxa fixa de 14%, sem taxa da plataforma) **diverge** do Financeiro (taxa real + plataforma).                                                                         | `features/listings/profit.ts:31-47` × `repositories/reports.ts:84-90`                                     |
| B18 | 🟡    | Ações feitas durante a impersonation **não são atribuídas ao admin**; chaves de API, webhooks e lojas ficam liberados.                                                                    | `lib/server/auth.ts:143-158`                                                                              |
| B19 | 🟡    | Admin troca o e-mail de um usuário para um endereço da `ADMIN_EMAILS` e o promove **sem passar pela auditoria**. Troca de e-mail não exige reverificação.                                 | `customers.functions.ts:198` → `auth.ts:270`                                                              |
| B20 | 🟢    | `redirect` validado só com `startsWith("/")` (possível `//host`).                                                                                                                         | `login.tsx:14`, `onboarding.tsx:30`                                                                       |

---

## A. Pedidos e fluxo até o fornecedor: P0

> **Cliente:** "Pedidos: fluxo completo do pedido até o fornecedor" (MVP). "0→1: primeira venda completa".
> **Hoje:** o pedido só é importado do marketplace. `/pedidos` é uma lista para avaliar fornecedores.

| #   | Pergunta                                                                                                                 | Status  | Lacuna / o que fazer                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Existe **pedido de compra ao fornecedor** gerado a partir da venda?                                                      | ❌      | Criar a entidade `supplier_order` (venda → item(ns) → fornecedor) com estado próprio.                                                                                                         |
| A2  | Quais **estados** o pedido do fornecedor tem?                                                                            | ❌      | Proposta: `aguardando_pagamento → pago → aceito → em_separacao → enviado → entregue → liberado` e `recusado/cancelado/devolvido`.                                                             |
| A3  | O fornecedor **fica sabendo** da venda? Como?                                                                            | ❌ ❓D6 | Portal, e-mail ou WhatsApp. Hoje ninguém é avisado.                                                                                                                                           |
| A4  | O fornecedor pode **recusar** (sem estoque)? O que acontece com a venda no marketplace?                                  | 🟡      | Recusa pelo link avisa o revendedor no sino e permite reencaminhar (item 06). Trocar de fornecedor não se faz (regra R3, `decisions.md` 2026-10-15); falta cancelar no marketplace (item 22). |
| A5  | Existe **prazo de aceite e de envio** (SLA do fornecedor)? Quem é cobrado no atraso?                                     | ❌      | Campo de prazo de envio no fornecedor e alerta de atraso (ligado ao bloco I).                                                                                                                 |
| A6  | Existe **página de detalhe do pedido** com linha do tempo, itens, comprador, endereço, taxas, rastreio e link para o ML? | ✅      | `/pedidos/$orderId` com itens, comprador, dinheiro, andamento, envios com rastreio e link para o ML (item 20.b, 13/10).                                                                       |
| A7  | Os status do marketplace são todos mapeados (shipped, delivered, returned, refunded, claims)?                            | 🟡      | Só pending/paid/cancelled (B4).                                                                                                                                                               |
| A8  | Existe **fallback de polling** quando o webhook falha?                                                                   | ❌      | `listOrders` existe e nunca é chamado. Criar um job de reconciliação.                                                                                                                         |
| A9  | Pedido com itens de **vários fornecedores** gera vários pedidos de compra?                                               | ❌      | Definir a separação por fornecedor.                                                                                                                                                           |
| A10 | Cancelamento ou devolução no marketplace **propaga** para o fornecedor e para o pagamento?                               | ❌      | Depende de A1, C e D.                                                                                                                                                                         |
| A11 | `/pedidos` mostra **filtros** (status, loja, período) e "precisa de ação"?                                               | ✅      | Aba Operação com busca, etapa, período e loja, guardados no endereço (item 20.c, 14/10). A etapa separa o que precisa de ação.                                                                |

## B. Fornecedores: cadastro, portal e estoque real (P0)

> **Cliente:** "Fornecedores reais: estoque real, produtos reais e operação confiável". "Rede de fornecedores" e "Catálogo e estoque compartilhado" para desenvolver internamente.
> **Hoje:** fornecedores e produtos vêm só do seed, sem fotos. Ninguém atualiza estoque.

| #    | Pergunta                                                                                                                                                      | Status  | Lacuna / o que fazer                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| B-1  | Como um fornecedor **entra** na plataforma? Admin cadastra, autocadastro ou convite?                                                                          | ❌ ❓D6 | Mínimo: CRUD de fornecedor no admin. Ideal: convite com portal.           |
| B-2  | Existe **tipo de usuário fornecedor** com login e painel?                                                                                                     | ❌      | `user.role` só tem user/admin.                                            |
| B-3  | **Cadastro do fornecedor** completo: CNPJ, razão social, endereço, contato, WhatsApp, prazo de envio, pedido mínimo, política de troca, dados de recebimento? | 🟡      | Hoje só name, niche, description, state, city, logoUrl e active.          |
| B-4  | **Aprovação/KYC** do fornecedor antes de aparecer no catálogo?                                                                                                | ❌      | Status `pendente/aprovado/suspenso`.                                      |
| B-5  | Quem **cria e edita produtos**? Formulário, importação CSV/planilha, API?                                                                                     | ❌      | Nada fora do seed.                                                        |
| B-6  | O produto tem os campos que o **marketplace exige**: fotos, EAN/GTIN, marca, modelo, peso, dimensões, variações (cor/tamanho), NCM?                           | 🟡      | Faltam todos. As fotos do seed estão vazias, então o ML recusa o anúncio. |
| B-7  | **Estoque real**: como chega (manual, planilha, API, integração com ERP)? Com que frequência?                                                                 | ❌      | Só a coluna estática `stock`.                                             |
| B-8  | **Reserva e baixa de estoque** na venda, compartilhado entre revendedores?                                                                                    | ❌      | B1. Precisa de reserva atômica e devolução ao cancelar.                   |
| B-9  | O revendedor vê **quando o estoque foi atualizado** pela última vez?                                                                                          | ❌      | `updatedAt` existe, mas não aparece.                                      |
| B-10 | Produto **descontinuado**: o revendedor é avisado? O anúncio é pausado?                                                                                       | ✅      | B9.                                                                       |
| B-11 | Cobertura por **faixa de CEP ou raio**, com prazo e frete por região?                                                                                         | 🟡      | Só UF ou cidade.                                                          |
| B-12 | Região sem fornecedor: **lista de espera** ou sugestão?                                                                                                       | 🟡      | Só um aviso.                                                              |
| B-13 | O fornecedor **responde avaliações**? Há moderação ou denúncia?                                                                                               | ❌      | Não há usuário fornecedor.                                                |
| B-14 | A página do fornecedor mostra contato, prazos, cobertura e política?                                                                                          | 🟡      | Mostra nome, nicho, cidade, reputação e catálogo.                         |
| B-15 | Painel do fornecedor: pedidos recebidos, a enviar, recebimentos, reputação?                                                                                   | ❌      | Depende de D6.                                                            |

## C. Pagamentos, split e custódia: P0

> **Áudio 1:** Pix e cartão, gateway, split de 4% para a plataforma, liberação só com o pedido entregue, para evitar golpe.
> **Hoje:** não existe nada de pagamento.

| #   | Pergunta                                                                                                     | Status     | Lacuna / o que fazer                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------- |
| C1  | O revendedor **paga o fornecedor** dentro da plataforma?                                                     | ❌         | Fluxo "organizar pagamento" ligado ao pedido de compra (A1).    |
| C2  | Quais **meios**: Pix (QR + copia e cola), cartão (parcelado?), boleto?                                       | ❌ ❓D3    |                                                                 |
| C3  | **Gateway** e abstração: interface `PaymentGateway` com um adapter mock (como o marketplace mock) e um real? | ❌ ❓D3    | Construir a interface e o mock já; o adapter real depois de D3. |
| C4  | **Split**: % configurável (padrão 4%), subconta do fornecedor, conta da plataforma.                          | ❌ ❓D1/D2 | Taxa em basis points e por plano, se houver.                    |
| C5  | **Custódia**: o dinheiro fica retido até "entregue"? Prazo extra para devolução?                             | ❌ ❓D4    | Máquina de estados do repasse.                                  |
| C6  | **Webhooks do gateway** (pago, estornado, chargeback) com idempotência e assinatura.                         | ❌         | Mesmo padrão do `webhook_events`.                               |
| C7  | **Estorno** total ou parcial quando o fornecedor recusa, o comprador devolve ou o marketplace cancela.       | ❌         |                                                                 |
| C8  | **Chargeback / disputa**: quem absorve?                                                                      | ❌ ❓      |                                                                 |
| C9  | **Extrato** para o revendedor (pago, a pagar) e para o fornecedor (a receber, liberado, retido).             | ❌         |                                                                 |
| C10 | **Conciliação** diária com o gateway e relatório para o admin.                                               | ❌         |                                                                 |
| C11 | O pagamento ao fornecedor entra no **cálculo de lucro** do revendedor (custo real pago × custo de catálogo)? | 🟡         | Hoje o lucro usa `unitCostCents` do catálogo.                   |
| C12 | Dados financeiros sensíveis: **nada de cartão no nosso banco** (tokenização no gateway), PCI.                | —          | Requisito de implementação.                                     |

## D. Logística, rastreio e previsão de entrega: P0 (rastreio) / P1 (previsão)

> **Áudio 2:** "o rastreio está dentro da nossa plataforma, com a previsibilidade de quando a mercadoria vai chegar". Integrar "frete e rastreio" (PDF). Transportadora própria está **fora**.
> **Hoje:** nada. O conector ML não usa `/shipments`.

| #   | Pergunta                                                                                                 | Status  | Lacuna / o que fazer                                                               |
| --- | -------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| D-1 | Ler o **envio do ML** (`/shipments/{id}`): status, código de rastreio, transportadora, previsão.         | ❌      | Assinar o tópico `shipments`, adicionar ao conector e gravar em `order_shipments`. |
| D-2 | **Etiqueta**: quem imprime (fornecedor)? Mercado Envios (ME2) gera a etiqueta: o fornecedor acessa como? | ❌ ❓D5 | Download da etiqueta no portal do fornecedor.                                      |
| D-3 | **Linha do tempo** de rastreio na página do pedido.                                                      | ✅      | Andamento do pedido e linha do tempo de cada envio na página (item 20.b).          |
| D-4 | **Previsão de entrega** e **alerta de atraso** antes de acontecer.                                       | ❌      | Comparar a previsão com o status atual (job).                                      |
| D-5 | **Custo de frete** entra no lucro?                                                                       | ❌      | Não há custo de frete em lugar nenhum.                                             |
| D-6 | Para marketplaces sem frete próprio: Melhor Envios, Correios?                                            | ❌      | P2, só depois dos marketplaces.                                                    |
| D-7 | "Entregue" dispara a **liberação** do pagamento (C5) e a **avaliação** do fornecedor.                    | ❌      |                                                                                    |

## E. Catálogo e publicação (jornada do lojista): P0/P1

> **Cliente:** "Publicação em lote: vários anúncios com regra de preço". "Regras de margem e lucro".
> **Hoje:** existe e funciona no mock, com várias lacunas para o ML real.

| #   | Pergunta                                                                                                        | Status | Lacuna / o que fazer                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| E1  | O lojista consegue **editar antes de publicar**: título, descrição, fotos, categoria, atributos, estoque?       | 🟡     | O individual edita título, descrição e preço. A massa só edita preço. Nenhum dos dois edita fotos, categoria ou atributos. |
| E2  | **Categoria do ML**: confirmada pelo usuário ou adivinhada?                                                     | 🟡     | `domain_discovery` com limit=1, sem confirmação.                                                                           |
| E3  | **Atributos obrigatórios** do ML (BRAND, MODEL, GTIN...)?                                                       | ❌     | TODO aberto. A publicação real falha.                                                                                      |
| E4  | **Clássico × Premium**, modo de envio (ME2/Flex), garantia, condição.                                           | ❌     | Fixos no código (`gold_special`, `new`).                                                                                   |
| E5  | **Variações** (cor/tamanho)?                                                                                    | ❌     |                                                                                                                            |
| E6  | **Prévia de margem** com a taxa real do marketplace/categoria + frete + taxa da plataforma + 4% (se aplicável)? | 🟡     | Taxa fixa de 14% (B17).                                                                                                    |
| E7  | **Piso de preço** que garante lucro mínimo, não só "acima do custo"?                                            | 🟡     | Custo + R$0,01 é aceito.                                                                                                   |
| E8  | O servidor **bloqueia publicar sem estoque**?                                                                   | ❌     | Só a interface esconde o botão.                                                                                            |
| E9  | **Duplicidade**: produto já publicado na mesma loja?                                                            | ✅     | Individual e massa checam (B2, 02.a).                                                                                      |
| E10 | **Progresso da publicação em massa** com %, "x de y" e tempo restante (pedido do áudio 2).                      | ❌     | Só polling e status por card.                                                                                              |
| E11 | **Erros do ML em português claro**, com o `cause[]` e o que fazer.                                              | 🟡     | A mensagem chega crua em inglês/espanhol.                                                                                  |
| E12 | **Falha parcial na massa** é informada corretamente?                                                            | 🟡     | O toast de erro esconde o que já foi enfileirado.                                                                          |
| E13 | **Limite por plano** de anúncios e lojas.                                                                       | ❌     | Depende do bloco M.                                                                                                        |

## F. Anúncios e lojas: P1

| #   | Pergunta                                                                                       | Status | Lacuna / o que fazer                              |
| --- | ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| F1  | Editar título, descrição, fotos e estoque **depois de publicar**, com push para o marketplace? | 🟡     | Só o preço.                                       |
| F2  | O usuário sabe que **preço e estoque levam até 15 min** para chegar ao marketplace?            | ❌     | Mostrar "sincronizando" e a última sincronização. |
| F3  | **Pausar e encerrar nativos** no ML (não só estoque 0)? Excluir anúncio?                       | 🟡     | O conector não tem esses métodos.                 |
| F4  | **Status vindo do ML** (pausado, em revisão, encerrado pelo ML)?                               | ❌     | Assinar o tópico `items`.                         |
| F5  | **Página de detalhe do anúncio** com vendas, histórico de mudanças e erros.                    | ❌     |                                                   |
| F6  | Ao **desconectar a loja**, o que acontece com os anúncios ativos? Opção de encerrar?           | 🟡     | Ficam vendendo sem sync.                          |
| F7  | **Saúde da loja**: último sync, último webhook, validade do token, reputação do ML.            | 🟡     | Só status, erro e atividade.                      |
| F8  | **Shopee** real (citada no áudio), **TikTok Shop**, **Amazon** (no mockup)?                    | ❌     | Stubs. A Amazon nem está no enum.                 |
| F9  | Aviso de **loja expirada** fora do app (e-mail/WhatsApp)?                                      | 🟡     | Só o sino.                                        |

## G. Financeiro e dashboard: P1

> **Cliente:** "Financeiro pedido a pedido: receita, custo, taxas e lucro real". "Lucro e margem real".

| #   | Pergunta                                                                                                                                                                          | Status  | Lacuna / o que fazer                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Taxas **reais** do marketplace por pedido?                                                                                                                                        | 🟡      | `sale_fee × qty` com TODO; falta conferir se é por unidade.                                                                                            |
| G2  | **Reembolsos, devoluções e comissões reais** ingeridos?                                                                                                                           | 🟡      | Reembolso do ML vira ajuste idempotente e pedido devolvido sai da receita (04.b, 13/10). Aparece no Financeiro (04.c). Comissões continuam só manuais. |
| G3  | **Frete e impostos** no lucro?                                                                                                                                                    | ❌      |                                                                                                                                                        |
| G4  | O que conta como **venda**: pending conta?                                                                                                                                        | 🟡      | Conta (B10). Definir: só pagos.                                                                                                                        |
| G5  | **Taxa da plataforma** (mensalidade/4%) no lucro do revendedor?                                                                                                                   | 🟡      | `PLATFORM_FEE_BASIS_POINTS` com padrão 0.                                                                                                              |
| G6  | Dashboard: **saudação, KPI de produtos ativos e lojas conectadas, rosca de categorias, pedidos recentes com logo e status, card de resumo financeiro, ações rápidas, atividade**? | 🟡 ❓D8 | Tem KPIs, evolução, vendas por loja, top produtos e "Precisa de você".                                                                                 |
| G7  | Fuso: `relative-time.ts` usa o fuso do servidor no SSR?                                                                                                                           | 🟡      | Forçar America/Sao_Paulo.                                                                                                                              |
| G8  | **Relatórios avançados** por plano (Pro+)?                                                                                                                                        | ❌      | Depende de M.                                                                                                                                          |

## H. Notificações e comunicação: P1

> **Áudio 2:** "assim que vender em qualquer marketplace, chega uma notificação nossa [WhatsApp ou app]: você acabou de vender, com o valor; entre e organize seu pagamento".

| #   | Pergunta                                                                                                                                                                                  | Status  | Lacuna / o que fazer                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| H1  | Canais: in-app, **e-mail, push (PWA), WhatsApp**?                                                                                                                                         | 🟡 ❓D9 | Só in-app, com polling de 60 s.                           |
| H2  | **Catálogo de eventos** que notificam: venda, pagamento pendente, fornecedor aceitou/enviou, atraso, entregue, dinheiro liberado, loja expirada, erro de publicação, resposta de suporte. | 🟡      | Hoje: venda, erro de anúncio, loja e resposta de suporte. |
| H3  | **Preferências por canal e evento**, salvas no servidor.                                                                                                                                  | ❌      | Só o som, em localStorage.                                |
| H4  | **Telefone/WhatsApp** do usuário com opt-in (LGPD)?                                                                                                                                       | ❌      | Não há campo de telefone.                                 |
| H5  | **Fila de envio** com retentativa e log (outbox), como os webhooks de saída.                                                                                                              | ❌      | Reaproveitar o padrão do `webhook-delivery`.              |
| H6  | Venda **pending** notifica como venda?                                                                                                                                                    | 🟡      | Hoje sim. Definir.                                        |
| H7  | E-mail transacional com **template HTML** e marca?                                                                                                                                        | 🟡      | `mailer.ts` envia só texto.                               |
| H8  | Notificações para **fornecedor** e **staff**?                                                                                                                                             | ❌      |                                                           |

## I. Previsibilidade (onboarding, etapas e tempo): P1

> **Áudio 2:** "previsibilidade do que vai acontecer e tempo, em toda a estrutura, do cadastro à contabilidade… coloca a porcentagem de quanto falta… a loja pronta, quanto tempo vai gastar".

| #   | Pergunta                                                                                                                                                       | Status | Lacuna / o que fazer                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| I1  | Onboarding com **% de conclusão** e **tempo estimado por etapa**?                                                                                              | 🟡     | "X de 3" sem tempo.                                           |
| I2  | Etapas completas: cadastro → dados da empresa → região → loja → primeira publicação → (pagamento/plano) → primeira venda.                                      | 🟡     | 3 etapas.                                                     |
| I3  | "**Sua loja fica pronta em ~X min**"?                                                                                                                          | ❌     |                                                               |
| I4  | Pular ou retomar explicitamente?                                                                                                                               | 🟡     | Implícito.                                                    |
| I5  | **Linha do tempo previsível** em cada processo: publicação (ETA), pedido (aceite → envio → entrega), repasse (data de liberação), chamado (prazo de resposta). | ❌     | Componente único "linha do tempo com previsão", reutilizável. |
| I6  | **Aviso proativo de atraso** ("pode atrasar 2 dias") antes da reclamação.                                                                                      | ❌     | Depende de D-4 e A5.                                          |

## J. Suporte e atendimento: P1 (entregue em 2026-10-12, salvo onde indicado)

> **Cliente:** "Suporte e estabilidade" (1→100), "Atendimento prioritário" (Elite).
> **Entregue:**
>
> - Botão "Suporte" fixo no topo, com contador de respostas não lidas.
> - Cargos atendente, supervisor e admin.
> - Filas, responsável, prioridade, tema e prazo de resposta por prioridade.
> - Histórico de mudanças e "não lido" real.
> - E-mail ao revendedor quando o suporte responde.
> - Encerramento pelo cliente, avaliação de 1 a 5 e fechamento automático após 7 dias.
> - Métricas do suporte.
>
> Decisão em `docs/decisions.md` (2026-10-12).

| #   | Pergunta                                                               | Status   | Onde / o que falta                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J0  | **Botão de suporte visível** para o lojista?                           | ✅       | `components/layout/support-button.tsx`: no topo, ao lado do sino, com contador de não lidas, "Abrir chamado" e os 3 últimos chamados.                                                                                                                                            |
| J1  | **Onde o suporte responde?**                                           | ✅       | `/admin/chamados` (filas) e `/admin/chamados/$ticketId` (conversa, painel de atendimento, cliente e histórico).                                                                                                                                                                  |
| J2  | **Cargos**: admin, supervisor, atendente?                              | ✅ ❓D11 | `agent`, `supervisor` e `admin` em `shared/domain/staff-access.ts`. O admin define o cargo na ficha do usuário. Só `admin` tem poderes do plugin (banir, entrar como cliente) e acesso a Clientes. Matriz de permissões a validar com o cliente.                                 |
| J3  | **Atribuição**, reatribuição, filas "sem responsável" e "minha caixa"? | ✅       | Filas: Sem responsável, Minha caixa, Atrasados e Todos, com contadores. Atendente assume ou devolve o próprio chamado; supervisor+ passa para qualquer pessoa. A primeira resposta de quem não tinha o chamado o atribui automaticamente.                                        |
| J4  | **Prioridade** e **categoria**?                                        | ✅       | Categoria (tema) escolhida pelo revendedor ao abrir; prioridade definida pela equipe. Os dois aparecem como filtros na lista.                                                                                                                                                    |
| J5  | Vínculo com **pedido, loja ou anúncio**?                               | ❌       | O formulário aceita `?categoria=&assunto=` para links contextuais, mas não há referência a pedido ou anúncio. Próximo passo.                                                                                                                                                     |
| J6  | **SLA**?                                                               | 🟡       | Prazo de resposta por prioridade: urgente 2 h, alta 8 h, normal 24 h, baixa 48 h. Relógio em `awaiting_since`, selo "Vence em / Atrasado" para a equipe e "Resposta prevista até…" para o revendedor. **Faltam:** horário comercial, SLA por plano (Elite) e prazo de resolução. |
| J7  | Avisos por **e-mail**?                                                 | 🟡       | O revendedor recebe e-mail a cada resposta pública. **Falta:** avisar a equipe por e-mail ou push quando entra chamado (hoje só contador e filas).                                                                                                                               |
| J8  | **Não lido real**?                                                     | ✅       | Tabela `ticket_reads` por pessoa, dos dois lados. Abrir a conversa marca como lida. Corrige B14 (o aviso não depende mais do status).                                                                                                                                            |
| J9  | **Templates** com CRUD?                                                | ❌       | Continuam fixos em `reply-templates.ts`. Próximo passo: tabela com CRUD para supervisor+.                                                                                                                                                                                        |
| J10 | **Histórico**?                                                         | ✅       | Tabela `ticket_events` (status, responsável, prioridade, tema, avaliação), mostrada no painel "Histórico".                                                                                                                                                                       |
| J11 | **Auto-fechar**, cliente encerra, reabrir?                             | ✅       | Botão "Encerrar chamado" para o cliente. Job `ticket-auto-close` de hora em hora encerra chamados respondidos e sem retorno há 7 dias. Escrever de novo reabre.                                                                                                                  |
| J12 | **CSAT**?                                                              | ✅       | Nota de 1 a 5 com comentário opcional, uma por encerramento; reabrir zera para a próxima.                                                                                                                                                                                        |
| J13 | **Métricas**?                                                          | ✅       | `/admin/chamados/metricas` (supervisor+): volume, tempo médio da 1ª resposta, % no prazo, satisfação, por pessoa e por tema, em 7, 30 ou 90 dias.                                                                                                                                |
| J14 | **Tempo real**?                                                        | 🟡       | Atualização automática a cada 15 s na conversa aberta e 30 s nas listas. Não usa WebSocket.                                                                                                                                                                                      |
| J15 | Formulário com **categoria** e busca na lista?                         | ✅       | Tema obrigatório com cartões, previsão de resposta e busca por assunto na lista.                                                                                                                                                                                                 |
| J16 | **Base de conhecimento / FAQ**?                                        | ❌       | P2.                                                                                                                                                                                                                                                                              |
| J17 | **Anexos em S3/R2** com rate limit?                                    | 🟡       | Disco local (B11).                                                                                                                                                                                                                                                               |

## K. Admin e equipe interna: P1

| #   | Pergunta                                                                                              | Status   | Lacuna / o que fazer                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| K1  | Modelo de **cargos internos** com permissões granulares?                                              | 🟡 ❓D11 | Atendente/supervisor/admin para o suporte (J2). Entre admins continua tudo igual (B7). |
| K2  | Criar **usuário de staff** pela interface (convite)?                                                  | ❌       | Só promovendo uma conta existente.                                                     |
| K3  | **Proteção de super-admin/owner** contra outros admins?                                               | ❌       | B6, B7.                                                                                |
| K4  | **Auditoria global** com tela, filtros e paginação, cobrindo suporte e endpoints crus do plugin?      | 🟡       | Só a timeline por cliente (8 eventos).                                                 |
| K5  | Impersonation: **atribuir ações ao admin**, logar o fim, bloquear ações sensíveis, duração explícita? | 🟡       | B18.                                                                                   |
| K6  | **CRUD de fornecedores, produtos e categorias** no admin?                                             | ❌       | Bloco B.                                                                               |
| K7  | **KPIs da plataforma**: GMV, MRR, ativos, churn, ativação, retenção (os KPIs do PDF)?                 | ❌       |                                                                                        |
| K8  | **Excluir conta** de cliente pela interface (com auditoria)? Notas sobre o cliente?                   | ❌       |                                                                                        |
| K9  | Gestão de **planos e assinaturas** do cliente (trocar plano, cortesia, inadimplência)?                | ❌       | Bloco M.                                                                               |
| K10 | **Financeiro da plataforma**: splits recebidos, repasses, retenções, conciliação.                     | ❌       | Bloco C.                                                                               |
| K11 | Ranking de clientes **em memória com teto de 5000**?                                                  | 🟡       | Mover para SQL antes de escalar.                                                       |

## L. Conta do lojista, equipe, LGPD e segurança: P1

| #   | Pergunta                                                                      | Status | Lacuna / o que fazer                                                 |
| --- | ----------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| L1  | Cadastro pede **telefone/WhatsApp, CPF/CNPJ, empresa**?                       | ❌     | Só nome, e-mail e senha.                                             |
| L2  | **E-mail verificado** obrigatório para operar?                                | ❌     | Só para admin.                                                       |
| L3  | **Equipe do lojista**: convidar membros, papéis (dono, operador, financeiro)? | ❌     | Tabelas existem sem uso (e expostas: B8). Recurso do plano Business. |
| L4  | **Aceite de termos** com versão e data gravados (checkbox)?                   | ❌     | Só texto passivo.                                                    |
| L5  | **Exclusão e exportação** de dados self-service (LGPD)?                       | ❌     | Via suporte. Termos e privacidade em rascunho jurídico.              |
| L6  | **2FA**, política de senha, senha vazada, lockout?                            | 🟡     | Mínimo de 8 caracteres e rate limit padrão em memória.               |
| L7  | **Rate limit** em server functions, uploads e webhook?                        | 🟡     | Só na API pública.                                                   |
| L8  | **Landing page, preços, SEO** (OG, sitemap, robots)?                          | ❌     | `/` redireciona.                                                     |

## M. Planos e assinatura: P1

> **PDF:** Start R$97, Pro R$197, Business R$397, Black R$697, Elite R$997. "A receita vem da mensalidade". Upgrade conforme a operação cresce.
> **Hoje:** não existe nada.

| #   | Pergunta                                                                                                                          | Status   | Lacuna / o que fazer                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| M1  | **Matriz recurso × plano** (lojas, anúncios, usuários, relatórios, fiscal, IA, SLA)?                                              | ❌ ❓D10 | Tabela de limites e flags por plano. |
| M2  | **Cobrança recorrente** (cartão/Pix/boleto), mesmo gateway do bloco C?                                                            | ❌ ❓D3  |                                      |
| M3  | **Trial**? Período grátis?                                                                                                        | ❌ ❓    |                                      |
| M4  | **Upgrade/downgrade** com pró-rata? Sugestão automática de upgrade pelo faturamento ("o faturamento do cliente indica evolução")? | ❌       |                                      |
| M5  | **Inadimplência**: carência, bloqueio parcial, avisos?                                                                            | ❌       |                                      |
| M6  | **Recursos liberados por plano** no servidor (não só na interface).                                                               | ❌       | Middleware `requirePlanFeature`.     |
| M7  | **Página de planos** pública e interna, faturas e notas da mensalidade.                                                           | ❌       |                                      |
| M8  | Tempo de casa e plano guardados para o **Club** (bloco P).                                                                        | ❌       |                                      |

## N. Fiscal e contabilidade: P2

> **PDF:** "Fiscal dentro da plataforma: fluxo fiscal mais simples", "Contabilidade parceira: atendimento contábil integrado". Integrar a infraestrutura de NF-e (não construir).

| #   | Pergunta                                                                                                          | Status | Lacuna / o que fazer                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| N1  | Quem emite a NF da venda ao consumidor: **revendedor ou fornecedor**? (Depende do modelo fiscal do dropshipping.) | ❌ ❓  | Decisão contábil antes de qualquer código. |
| N2  | Provedor de NF-e (Focus NFe, NFE.io, eNotas, PlugNotas)?                                                          | ❌ ❓  |                                            |
| N3  | Dados fiscais do produto (**NCM, CEST, origem**) e do usuário (regime tributário, certificado A1)?                | ❌     |                                            |
| N4  | Envio da **chave da NF ao marketplace** (o ML exige para alguns envios)?                                          | ❌     |                                            |
| N5  | **Contabilidade parceira**: o que integra (exportação, acesso do contador, chat)?                                 | ❌ ❓  |                                            |
| N6  | Menu **"Fiscal"** do mockup.                                                                                      | ❌     |                                            |

## O. IA: P2

> **PDF:** "IA assistente: ajuda, recomenda e simplifica decisões". Integrar (não "IA própria", que está **fora**).

| #   | Pergunta                                                                                                                                                                                                                                                        | Status | Lacuna / o que fazer                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| O1  | **Casos de uso** concretos? Proposta: (a) escrever título e descrição otimizados do anúncio; (b) recomendar produtos da região por margem e giro; (c) sugerir preço; (d) explicar o Financeiro ("por que meu lucro caiu"); (e) responder dúvidas (pré-suporte). | ❌ ❓  | Escolher 1–2 para começar: (a) e (d) dão mais valor com menos risco. |
| O2  | Provedor e modelo, custo por plano, limites de uso.                                                                                                                                                                                                             | ❌     | Recurso liberado nos planos Black/Elite? (D10)                       |
| O3  | Dados enviados à IA: só dados do tenant, sem PII, com registro de uso.                                                                                                                                                                                          | ❌     |                                                                      |
| O4  | Onde aparece: botão "melhorar com IA" na publicação, assistente lateral.                                                                                                                                                                                        | ❌     |                                                                      |

## P. Club & Experience e conquistas: P2 (digital) / P3 (físico)

> **PDF:** conquistas digitais (1ª venda, 100 pedidos, R$50 mil, R$100 mil). Jornada física: boas-vindas, 2 meses carta, 4 meses cartão e adesivos, 6 meses brinde, 9 meses garrafa ou kit, 12 meses placa. Reserva de até 5% da recorrência. "Experiências surpresa, não promessas automáticas".

| #   | Pergunta                                                                               | Status | Lacuna / o que fazer                               |
| --- | -------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| P1  | **Conquistas digitais**: regras, selos na interface, notificação ao conquistar?        | ❌     | Calcular a partir de orders/financials (job).      |
| P2  | Selos **visíveis** onde: perfil, dashboard?                                            | ❌     |                                                    |
| P3  | **Tempo de casa** baseado na mensalidade paga (não na data de cadastro)?               | ❌     | Depende de M.                                      |
| P4  | **Elegibilidade** (plano + permanência + adimplência) para os brindes físicos?         | ❌     |                                                    |
| P5  | **Gestão dos brindes no admin**: fila de elegíveis, endereço, enviado/entregue, custo. | ❌     | Sem promessa ao cliente na interface ("surpresa"). |
| P6  | **Reserva de 5%**: controle financeiro interno.                                        | ❌     |                                                    |

## Q. Design, interface e mobile: P1/P2

| #   | Pergunta                                                                                                                                                                           | Status  | Lacuna / o que fazer                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------- |
| Q1  | **Menu lateral** (mockup) × menu no topo (hoje)?                                                                                                                                   | 🟡 ❓D8 | `ui/sidebar.tsx` existe sem uso.                              |
| Q2  | Itens do menu do mockup: Início, Produtos, Fornecedores, Minhas lojas, Publicações, Pedidos, Vendas, Financeiro, **Fiscal**, Relatórios, **Clientes**, Integrações, Configurações. | 🟡      | Faltam Fiscal, Clientes, Relatórios separado e Configurações. |
| Q3  | **Barra de abas embaixo** no celular (Início, Produtos, Pedidos, Mais).                                                                                                            | ❌      |                                                               |
| Q4  | **PWA instalável** com service worker e push.                                                                                                                                      | 🟡      | Só o manifest.                                                |
| Q5  | Componentes do dashboard do mockup (G6).                                                                                                                                           | 🟡      |                                                               |
| Q6  | **Landing** com a identidade do PDF (verde, "A ponte entre quem vende e quem fornece").                                                                                            | ❌      |                                                               |
| Q7  | **Error boundary por rota**; axe cobrindo admin e integrações.                                                                                                                     | 🟡      |                                                               |
| Q8  | **Ações rápidas**: publicar produto, encontrar fornecedores, gerenciar pedidos, ver relatórios.                                                                                    | ❌      |                                                               |

## R. Infra e operação: P1

| #   | Pergunta                                                                                                                             | Status | Lacuna / o que fazer                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------ |
| R1  | **Monitoramento de erros** (Sentry ou similar) e alertas.                                                                            | ❌     |                                                        |
| R2  | **Health check do web**, Dockerfile e configuração de deploy.                                                                        | 🟡     | Só o worker tem `/health`.                             |
| R3  | **Backup** do Postgres e restauração testada.                                                                                        | ❌     |                                                        |
| R4  | **Storage de objetos** (S3/R2) para anexos, avatares e fotos de produtos.                                                            | ❌     | Disco local impede escalar.                            |
| R5  | **Sync de estoque que escala**: lotes de 200 sequenciais a cada 15 min para todos os tenants.                                        | 🟡     | Paralelizar por loja e disparar por evento de estoque. |
| R6  | Testes de **isolamento entre tenants nas server functions** (não só nos repositórios) e e2e de 403 para revendedor em funções admin. | 🟡     |                                                        |

---

## Fora de escopo (vetado pelo cliente)

Banco próprio · transportadora própria · IA própria · marketplace próprio para o consumidor final · recursos que não aceleram o MVP.
