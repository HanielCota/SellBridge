# Progresso: ícones e legendas (tooltips)

Plano: [PLANO-UX-ICONES.md](../PLANO-UX-ICONES.md) · Glossário: [GLOSSARIO-UX.md](../GLOSSARIO-UX.md) · Branch: `feat/ux-icones-tooltips` (sem push).

## Base (Etapa 1) — 2026-10-18 · `2dc29078`

- Legenda única: `Hint` (`apps/web/src/components/ui/hint.tsx`) sobre o tooltip do Radix. Abre após 300 ms com o mouse, na hora com o teclado, por toque (toque fora fecha), acima do elemento e com reposicionamento na borda da tela. `DisabledHint` explica botões desabilitados. Em controles cujo toque já faz a ação (aba, botão que abre painel), `openOnTap={false}`.
- Dicionário: `apps/web/src/components/icons/action-icons.ts` (função → ícone + texto da legenda). `NAV_TAB_ICONS` liga cada aba ao seu ícone.
- O atraso de 300 ms vale para os ~20 tooltips que já existiam no site.

## Vendedor · 0. Barra superior — 2026-10-18 · commit "feat(nav): icons and tooltips on the top bar"

**Proposta escolhida: A (minimalista)**, que vira o padrão do projeto. Propostas: [página clicável](../propostas/vendedor/0-barra-superior/index.html) · [A](vendedor/0-barra-superior/2-proposta-a.png) · [B](vendedor/0-barra-superior/2-proposta-b.png) · [C](vendedor/0-barra-superior/2-proposta-c.png).

Padrão A: ícone Phosphor regular de 18 px (abas) ou 20 px (botões redondos), na cor do texto, à esquerda do nome; `aria-hidden` quando há texto. Legenda com o visual do tema (fundo `foreground`, texto `background`, `text-xs`, cantos 8 px).

| Mudança                                                                                        | Arquivo                                   | Tela                                      | Antes                                                        | Depois                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Ícone nas 6 abas do vendedor (a partir de 1440 px) e legenda curta em cada aba                 | `components/layout/top-nav.tsx`           | `/dashboard` (todas as telas do vendedor) | [desktop](vendedor/0-barra-superior/1-antes-desktop.png)     | [desktop](vendedor/0-barra-superior/3-depois-desktop.png) · [claro](vendedor/0-barra-superior/3-depois-claro.png) |
| Ícones no menu do celular (abas e Suporte)                                                     | `components/layout/top-nav.tsx`           | menu lateral, < 1024 px                   | [celular](vendedor/0-barra-superior/1-antes-mobile-menu.png) | [celular](vendedor/0-barra-superior/3-depois-mobile-menu.png)                                                     |
| Botão do menu com o texto "Menu" a partir de 640 px; no celular fica só o ícone de três linhas | `components/layout/top-nav.tsx`           | barra < 1024 px                           | [celular](vendedor/0-barra-superior/1-antes-mobile.png)      | [celular](vendedor/0-barra-superior/3-depois-mobile.png)                                                          |
| Legenda em Buscar                                                                              | `components/layout/command-palette.tsx`   | barra                                     | [desktop](vendedor/0-barra-superior/1-antes-desktop.png)     | [desktop](vendedor/0-barra-superior/3-depois-desktop.png)                                                         |
| Legenda em Suporte                                                                             | `components/layout/support-button.tsx`    | barra                                     | [desktop](vendedor/0-barra-superior/1-antes-desktop.png)     | [claro](vendedor/0-barra-superior/3-depois-claro.png)                                                             |
| Legenda em Avisos                                                                              | `components/layout/notification-bell.tsx` | barra                                     | [desktop](vendedor/0-barra-superior/1-antes-desktop.png)     | [desktop](vendedor/0-barra-superior/3-depois-desktop-legenda-avisos.png)                                          |
| Ícone de Suporte do menu da conta vindo do dicionário                                          | `components/layout/user-menu.tsx`         | menu da conta                             | —                                                            | —                                                                                                                 |
| Opção `openOnTap`                                                                              | `components/ui/hint.tsx`                  | —                                         | —                                                            | —                                                                                                                 |

**Ícones novos no dicionário:** overview (SquaresFour), catalog (Package), listings (MegaphoneSimple), orders (ShoppingBag), stores (Storefront), financials (Wallet), search (MagnifyingGlass), notifications (Bell), menu (List). **Reaproveitado:** support (Headset, do PR #59).

**Componentes compartilhados alterados (aprovado: "Global agora"):** a barra superior é a mesma nas três áreas. Legendas de Buscar, Suporte, Avisos e Menu já valem para fornecedor e admin. Ícones nas abas só nas do vendedor; no modo equipe (admin, 10 abas) os ícones ficam desligados até a vez da área admin.

**Ajustes por medida (sem mudar lógica):**

- Ícones das abas só a partir de 1440 px: em 1280 px as abas passavam por cima do logo, e esconder o nome da conta quebrava o teste `profile.spec.ts` ("o avatar do topo abre o menu da conta"). Pela regra 10 o teste não foi alterado; a largura mínima dos ícones subiu.
- "Menu" com texto só a partir de 640 px: em 390 px o texto empurrava o logo para baixo do botão Buscar.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; E2E da barra (7 arquivos) 42/42. Nenhum teste alterado.

**Pendência encontrada (anterior a este trabalho):** em 1024 px o começo das abas já encosta 12 px no logo, também sem os ícones.

**Seção seguinte:** Vendedor · 1. Visão geral.

## Vendedor · 1. Visão geral — 2026-10-18 · commit "feat(dashboard): action labels and tooltips on the overview"

**Proposta escolhida: B (ações com texto)**, sobre o padrão A. Propostas: [página clicável](../propostas/vendedor/1-visao-geral/index.html) · [A](vendedor/1-visao-geral/2-proposta-a.png) · [B](vendedor/1-visao-geral/2-proposta-b.png) · [C](vendedor/1-visao-geral/2-proposta-c.png).

| Mudança                                                                                                        | Arquivo                                                                                       | Tela                                    | Antes                                                 | Depois                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Legenda em cada cartão (Receita, Pedidos, Ticket médio); "Ticket médio" com sublinhado pontilhado e explicação | `components/reports/kpi-tiles.tsx`                                                            | `/dashboard`                            | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [legenda](vendedor/1-visao-geral/3-depois-legenda-ticket.png)   |
| Botão do gráfico: ícone de gráfico no lugar da engrenagem, texto "Gráfico" (a partir de 1440 px) e legenda     | `components/reports/chart-kind-menu.tsx`                                                      | `/dashboard`, `/financeiro`             | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [desktop](vendedor/1-visao-geral/3-depois-desktop.png)          |
| Exportar: ícone próprio de "Exportar" (diferente de "Baixar"), texto (a partir de 1440 px) e legenda           | `components/reports/export-link.tsx` (saiu de `cash-flow-chart.tsx`, que passa de 500 linhas) | `/dashboard`, `/financeiro`             | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [desktop](vendedor/1-visao-geral/3-depois-desktop.png)          |
| "Ver tudo" com seta nos cartões Vendas por loja e Produtos mais vendidos, com legenda do destino               | `components/reports/sales-breakdown.tsx`                                                      | `/dashboard`                            | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [legenda](vendedor/1-visao-geral/3-depois-legenda-ver-tudo.png) |
| "Unid." virou "Unidades"                                                                                       | `components/reports/sales-breakdown.tsx`                                                      | `/dashboard`                            | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [desktop](vendedor/1-visao-geral/3-depois-desktop.png)          |
| Legenda no "Personalizado" do período (no celular é só o calendário)                                           | `components/reports/period-filters.tsx`                                                       | `/dashboard`, `/financeiro`, `/pedidos` | [celular](vendedor/1-visao-geral/1-antes-mobile.png)  | [celular](vendedor/1-visao-geral/3-depois-mobile.png)           |
| Legenda no botão de chat ("Fechar o chat" quando aberto)                                                       | `components/support/support-chat.tsx`                                                         | todas as telas                          | [desktop](vendedor/1-visao-geral/1-antes-desktop.png) | [claro](vendedor/1-visao-geral/3-depois-claro.png)              |

**Ícones novos no dicionário:** seeAll (ArrowUpRight), chartKind (ChartBar), exportReport (FileArrowDown), customPeriod (CalendarBlank), supportChat (ChatCircleDots). **Reaproveitados:** nenhum ícone da seção 0 aparece aqui. **Glossário:** entraram "Ticket médio", "Unidades", "Ver tudo" e "Gráfico". **Legendas de termos:** `TERM_HINTS` no dicionário.

**Componentes compartilhados (aprovado: "Aplicar nas três telas"):** o gráfico e o Exportar valem também no Financeiro; a legenda do período personalizado vale em Financeiro e Pedidos; a legenda do chat vale em todas as telas.

**Ajustes por medida (sem mudar lógica):**

- "Gráfico" e "Exportar" com texto só a partir de 1440 px. Em 1280 px o texto empurrava o filtro de lojas para uma segunda linha, em 768 px cortava o "Personalizado" e em 390 px apertava o valor do lucro em três linhas. Abaixo de 1440 px ficam os ícones novos com legenda.
- Para não abrir duas legendas ao mesmo tempo, "Ticket médio" é explicado na legenda do próprio cartão (o cartão inteiro é o link).
- O link "Ver tudo" passou a se chamar, para leitor de tela, "Ver tudo em vendas por loja" e "Ver tudo em produtos mais vendidos", porque o nome precisa conter o texto visível.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; E2E relacionados 59/59 (reports, financeiro-scroll, profile-tabs, profile-tabs-edges, support, support-links, order-page, accessibility, pending-cost, fulfillment). Nenhum teste alterado.

**Notado e não alterado (fora do escopo visual):** os botões Tudo, Receita e Lucro do gráfico são lidos pelo leitor de tela como "all", "revenue" e "profit"; e o leitor de tela ouve só "Ver receita no financeiro" no cartão, sem o valor.

**Seção seguinte:** Vendedor · 2. Catálogo, dividido em 2a (produtos) e 2b (fornecedores), aprovado pelo usuário.

## Vendedor · 2a. Catálogo: produtos — 2026-10-18 · commit "feat(catalog): one publish icon, action labels and tooltips"

**Proposta escolhida: B (ações com texto)**. Propostas: [página clicável](../propostas/vendedor/2a-catalogo-produtos/index.html) · [A](vendedor/2a-catalogo-produtos/2-proposta-a.png) · [B](vendedor/2a-catalogo-produtos/2-proposta-b.png) · [C](vendedor/2a-catalogo-produtos/2-proposta-c.png).

| Mudança                                                                                                                             | Arquivo                                                                                                                 | Tela                                         | Antes                                                               | Depois                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Um ícone só para Publicar (avião de papel) no cartão, na barra e na janela; antes eram a caixa (mesma da aba Catálogo) e o megafone | `components/catalog/catalog-product-card.tsx`, `routes/_app/catalogo.tsx`, `components/catalog/bulk-publish-dialog.tsx` | `/catalogo`                                  | [desktop](vendedor/2a-catalogo-produtos/1-antes-desktop.png)        | [claro, com legenda](vendedor/2a-catalogo-produtos/3-depois-claro.png) |
| Busca: "SKU" virou "código"                                                                                                         | `routes/_app/catalogo.tsx`                                                                                              | `/catalogo`                                  | [desktop](vendedor/2a-catalogo-produtos/1-antes-desktop.png)        | [desktop](vendedor/2a-catalogo-produtos/3-depois-desktop.png)          |
| "Ver por fornecedor" com ícone e legenda                                                                                            | `routes/_app/catalogo.tsx`                                                                                              | `/catalogo`                                  | [desktop](vendedor/2a-catalogo-produtos/1-antes-desktop.png)        | [desktop](vendedor/2a-catalogo-produtos/3-depois-desktop.png)          |
| Legendas em "Só com estoque" e "Ocultar publicados"                                                                                 | `routes/_app/catalogo.tsx`                                                                                              | `/catalogo`                                  | [desktop](vendedor/2a-catalogo-produtos/1-antes-desktop.png)        | [desktop](vendedor/2a-catalogo-produtos/3-depois-desktop.png)          |
| Legenda na caixinha de seleção e no selo "Publicado"                                                                                | `components/catalog/catalog-product-card.tsx`                                                                           | `/catalogo`                                  | [desktop](vendedor/2a-catalogo-produtos/1-antes-desktop.png)        | [legenda](vendedor/2a-catalogo-produtos/3-depois-legenda-caixinha.png) |
| Barra de seleção: X virou "Limpar" (só o X no celular), com legenda                                                                 | `components/data/selection-bar.tsx`                                                                                     | `/catalogo` e painel do fornecedor (Pedidos) | [seleção](vendedor/2a-catalogo-produtos/1-antes-selecao.png)        | [seleção](vendedor/2a-catalogo-produtos/3-depois-selecao.png)          |
| Janela Publicar: legendas em −/+ e ‹/›                                                                                              | `components/catalog/bulk-price-rule-picker.tsx`, `components/catalog/price-receipt.tsx`                                 | `/catalogo`                                  | [janela](vendedor/2a-catalogo-produtos/1-antes-janela-publicar.png) | [janela](vendedor/2a-catalogo-produtos/3-depois-janela-publicar.png)   |

**Ícones novos no dicionário:** publish (PaperPlaneTilt), suppliers (Factory), clearSelection (X), decrease (Minus), increase (Plus), previous (CaretLeft), next (CaretRight). **Textos novos:** `CONTROL_HINTS` (caixinha, só com estoque, ocultar publicados) e `TERM_HINTS.published`. **Glossário:** Código (no lugar de SKU), Publicar, Limpar, Ver por fornecedor.

**Componentes compartilhados (aprovado: "Aplicar nas duas"):** a barra de seleção também aparece no painel do fornecedor (aceitar pedidos em lote); conferido com a conta de fornecedor de teste.

**Ajustes por medida (sem mudar lógica):** "Limpar" só a partir de 640 px; em 390 px a barra ficava com 417 px e passava da tela.

**Ficou para a seção 3 (Publicações):** a legenda de "Taxa do marketplace". A linha vem de `components/listings/profit-split.tsx`, que também aparece em nova publicação e em editar preço. O selo "Esgotado" (`sold-out.tsx`, também em Publicações) não foi alterado.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; E2E relacionados 27/28 (accessibility, publishing, stock, suppliers, catalog-deactivation). Nenhum teste alterado. A falha (`stock.spec.ts`, "uma venda simulada reduz o estoque mostrado no catálogo") também acontece sem estas mudanças: o produto do primeiro anúncio da conta demo está esgotado no banco de testes (problema de dados que já existia).

**Seção seguinte:** Vendedor · 2b. Catálogo: fornecedores.

## Vendedor · 2b. Catálogo: fornecedores — 2026-10-18 · commit "feat(suppliers): explain the score, align terms and the publish icon"

**Proposta escolhida: B (score explicado à vista)**. Propostas: [página clicável](../propostas/vendedor/2b-catalogo-fornecedores/index.html) · [A](vendedor/2b-catalogo-fornecedores/2-proposta-a.png) · [B](vendedor/2b-catalogo-fornecedores/2-proposta-b.png) · [C](vendedor/2b-catalogo-fornecedores/2-proposta-c.png).

| Mudança                                                                                                            | Arquivo                                          | Tela                                                | Antes                                                          | Depois                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Número do score ao lado do nível ("Bom · 85") e legendas no nível, em "Fornecedor destaque" e em "Novo fornecedor" | `components/suppliers/reputation.tsx`            | `/fornecedores` e escolha de fornecedor do cadastro | [lista](vendedor/2b-catalogo-fornecedores/1-antes-lista.png)   | [claro, com legenda](vendedor/2b-catalogo-fornecedores/3-depois-claro.png)     |
| Linha explicando o score; legendas (com sublinhado pontilhado) no nível, nos pontos avaliados e em "meta até"      | `components/suppliers/reputation-panel.tsx`      | `/fornecedores/:id`                                 | [página](vendedor/2b-catalogo-fornecedores/1-antes-pagina.png) | [legenda da meta](vendedor/2b-catalogo-fornecedores/3-depois-legenda-meta.png) |
| "Vender este fornecedor" com legenda (ícone da aba Lojas, mesmo destino)                                           | `routes/_app/fornecedores/$supplierId.tsx`       | `/fornecedores/:id`                                 | [página](vendedor/2b-catalogo-fornecedores/1-antes-pagina.png) | [página](vendedor/2b-catalogo-fornecedores/3-depois-pagina.png)                |
| Busca "SKU" → "código"; "Somente com estoque" → "Só com estoque" (igual ao Catálogo)                               | `routes/_app/fornecedores/$supplierId.tsx`       | `/fornecedores/:id`                                 | [página](vendedor/2b-catalogo-fornecedores/1-antes-pagina.png) | [página](vendedor/2b-catalogo-fornecedores/3-depois-pagina.png)                |
| Cartão de produto: "SKU" → "código"; Publicar com o ícone único e legenda                                          | `components/suppliers/supplier-product-card.tsx` | `/fornecedores/:id`                                 | [página](vendedor/2b-catalogo-fornecedores/1-antes-pagina.png) | [página](vendedor/2b-catalogo-fornecedores/3-depois-pagina.png)                |

**Ícones:** nenhum novo; reaproveitados publish (PaperPlaneTilt) e stores (Storefront). **Textos novos:** `TERM_HINTS` (nível do score, destaque, novo fornecedor, ponto avaliado, meta) e `CONTROL_HINTS.sellSupplier`. **Glossário:** Score, Fornecedor destaque, Novo fornecedor, Meta.

**Componentes compartilhados (aprovado: "Aplicar em todas"):** o resumo do score também aparece na escolha de fornecedor do cadastro (`components/onboarding/supplier-picker.tsx`). O início do painel do fornecedor usa só o termômetro, que não mudou.

**Acessibilidade:** nos cartões (link esticado sobre o cartão) e nas opções do cadastro, a legenda do nível abre com o mouse ou toque, mas não recebe foco próprio, para não criar um controle dentro de outro; o nível fica acima do link esticado para o mouse alcançar. Na página do fornecedor as legendas recebem foco pelo teclado.

**Testes ajustados (aprovados pelo usuário em 2026-10-18):** `e2e/suppliers.spec.ts` (linhas 139 e 141) e `e2e/store-supplier.spec.ts` (linha 69) procuravam "Somente com estoque"; passaram a procurar "Só com estoque". Depois do ajuste: 11/11. Demais: typecheck, oxlint e Prettier limpos; Vitest web 853/853; accessibility, reviews, browser-defaults, account-terms e profile verdes.

**Seção seguinte:** Vendedor · 3. Publicações, dividida em 3a (lista) e 3b (nova publicação), aprovado pelo usuário.

## Vendedor · 3a. Publicações: lista — 2026-10-18 · commit "feat(listings): status in words, action hints and fee legend"

**Proposta escolhida: B (status à vista)**. Propostas: [página clicável](../propostas/vendedor/3a-publicacoes-lista/index.html) · [A](vendedor/3a-publicacoes-lista/2-proposta-a.png) · [B](vendedor/3a-publicacoes-lista/2-proposta-b.png) · [C](vendedor/3a-publicacoes-lista/2-proposta-c.png).

| Mudança                                                                                               | Arquivo                                     | Tela                | Antes                                                            | Depois                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Botão "⋯" mostra o status em palavra ao lado do ponto ("• No ar"), com legenda; o `title` nativo saiu | `components/listings/listing-actions.tsx`   | `/publicacoes`      | [desktop](vendedor/3a-publicacoes-lista/1-antes-desktop.png)     | [desktop](vendedor/3a-publicacoes-lista/3-depois-desktop.png)     |
| "Simular venda" com a linha "Teste: cria um pedido sem cobrar ninguém"                                | `components/listings/listing-actions.tsx`   | menu ⋯              | [menu](vendedor/3a-publicacoes-lista/1-antes-menu.png)           | [menu](vendedor/3a-publicacoes-lista/3-depois-menu.png)           |
| Legendas em "N vendas em 30 dias" e na caixinha de seleção                                            | `components/listings/listing-card.tsx`      | `/publicacoes`      | [desktop](vendedor/3a-publicacoes-lista/1-antes-desktop.png)     | [claro](vendedor/3a-publicacoes-lista/3-depois-claro.png)         |
| "Publicar produtos" com o ícone único de publicar e legenda                                           | `routes/_app/publicacoes/index.tsx`         | `/publicacoes`      | [desktop](vendedor/3a-publicacoes-lista/1-antes-desktop.png)     | [desktop](vendedor/3a-publicacoes-lista/3-depois-desktop.png)     |
| Editar preço: legendas em "saudável" e na taxa (sublinhado pontilhado)                                | `components/listings/edit-price-dialog.tsx` | janela Editar preço | [janela](vendedor/3a-publicacoes-lista/1-antes-editar-preco.png) | [janela](vendedor/3a-publicacoes-lista/3-depois-editar-preco.png) |

**Ícones:** nenhum novo; reaproveitado publish (PaperPlaneTilt). **Textos novos:** `TERM_HINTS` (vendas em 30 dias, faixas da margem, taxa do marketplace) e `CONTROL_HINTS` (ações do anúncio, publicar pelo Catálogo, simular venda, selecionar anúncios). **Glossário:** Simular venda, faixas da margem, Taxa do marketplace. **Reorganização:** `HintedText` (texto com legenda) foi para `components/ui/hint.tsx`, ao lado do `Hint`, porque agora é usado em Fornecedores e Publicações.

**Não alterado:** a legenda em "Com erro" exigiria mexer em `components/data/segmented-control.tsx`, usado também em Pedidos, chaves de API e admin; fica para quando as abas forem revisadas juntas.

**Testes ajustados (aprovados pelo usuário em 2026-10-18):** `e2e/publishing.spec.ts` linha 58, mesma troca da 2b ("Somente com estoque" → "Só com estoque"), que não tinha sido rodado na 2b. Depois: publishing, accessibility, browser-defaults e catalog-deactivation 20/20; Vitest web 853/853; typecheck, oxlint e Prettier limpos. `stock.spec.ts` segue com a falha de dados já registrada na 2a.

**Seção seguinte:** Vendedor · 3b. Publicações: nova publicação.

## Vendedor · 3b. Publicações: nova publicação — 2026-10-18 · commit "feat(listings): explain the new listing form"

**Proposta escolhida: B (explicações à vista)**. Propostas: [página clicável](../propostas/vendedor/3b-publicacoes-nova/index.html) · [A](vendedor/3b-publicacoes-nova/2-proposta-a.png) · [B](vendedor/3b-publicacoes-nova/2-proposta-b.png) · [C](vendedor/3b-publicacoes-nova/2-proposta-c.png).

| Mudança                                                                         | Arquivo                                                                                                              | Tela                                                             | Antes                                                       | Depois                                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Legenda no contador de caracteres e nos preços prontos (sugerido e cada margem) | `routes/_app/publicacoes/nova.tsx`                                                                                   | `/publicacoes/nova`                                              | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [legenda do preço](vendedor/3b-publicacoes-nova/3-depois-legenda-preco.png)                                                          |
| "Loja simulada" → "Loja simulada · pedidos de teste"                            | `routes/_app/publicacoes/nova.tsx`                                                                                   | `/publicacoes/nova`                                              | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [desktop](vendedor/3b-publicacoes-nova/3-depois-desktop.png)                                                                         |
| "Publicar em N lojas" com o ícone único de publicar e legenda                   | `routes/_app/publicacoes/nova.tsx`                                                                                   | `/publicacoes/nova`                                              | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [desktop](vendedor/3b-publicacoes-nova/3-depois-desktop.png)                                                                         |
| "Enviado pelo fornecedor" com caminhão e legenda                                | `components/listings/new-listing-cards.tsx` (prévia e quadro de lucro saíram de `nova.tsx`, que passa de 500 linhas) | `/publicacoes/nova`                                              | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [claro](vendedor/3b-publicacoes-nova/3-depois-claro.png)                                                                             |
| Legenda (com sublinhado pontilhado) em "Taxa do marketplace"                    | `components/listings/profit-split.tsx`                                                                               | `/publicacoes/nova` e janela "Publicar selecionados" do Catálogo | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [desktop](vendedor/3b-publicacoes-nova/3-depois-desktop.png) · [Catálogo](vendedor/3b-publicacoes-nova/3-depois-janela-catalogo.png) |
| Botão de chat escondido nesta tela (cobria o "Publicar")                        | `components/support/support-chat.tsx`                                                                                | `/publicacoes/nova`                                              | [desktop](vendedor/3b-publicacoes-nova/1-antes-desktop.png) | [desktop](vendedor/3b-publicacoes-nova/3-depois-desktop.png)                                                                         |

**Ícones novos:** supplierShips (Truck). **Reaproveitado:** publish (PaperPlaneTilt). **Textos novos:** `TERM_HINTS` (limite de caracteres, preço sugerido). Pendência da 2a (legenda da taxa na janela do Catálogo) resolvida.

**Componentes compartilhados (aprovados):** `profit-split.tsx` (legenda da taxa nas duas telas); `support-chat.tsx` (escondido só em `/publicacoes/nova`, a ajuda continua no botão Suporte da barra).

**Não alterado:** o selo "42% de margem" fica dentro do campo de preço e não recebe o mouse (para não atrapalhar a digitação), então não ganhou legenda; a frase do topo já diz o lucro e a margem.

**Ajuste por medida:** "Enviado pelo fornecedor" com caminhão quebra em duas linhas na prévia em vez de encostar na borda do cartão (sobravam 5 px).

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; E2E relacionados 35/35 (publishing, profile-tabs, store-supplier, store-disconnect, csv-attributes, suppliers, accessibility). Nenhum teste alterado.

**Seção seguinte:** Vendedor · 4. Pedidos, dividida em 4a (operação), 4b (operar pedido e página do pedido) e 4c (avaliações), aprovado pelo usuário.

## Vendedor · 4a. Pedidos: operação — 2026-10-18 · commit "feat(orders): status hints and clock on late orders"

**Proposta escolhida: B (atraso sem depender de cor)**. Propostas: [página clicável](../propostas/vendedor/4a-pedidos-operacao/index.html) · [A](vendedor/4a-pedidos-operacao/2-proposta-a.png) · [B](vendedor/4a-pedidos-operacao/2-proposta-b.png) · [C](vendedor/4a-pedidos-operacao/2-proposta-c.png).

| Mudança                                                          | Arquivo                                 | Tela       | Antes                                                       | Depois                                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------- | ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Legenda em cada status do pedido (o que significa e o que fazer) | `components/fulfillment/operations.tsx` | `/pedidos` | [desktop](vendedor/4a-pedidos-operacao/1-antes-desktop.png) | [desktop](vendedor/4a-pedidos-operacao/3-depois-desktop.png)                                                           |
| Aviso de atraso com ícone de relógio e legenda                   | `components/fulfillment/operations.tsx` | `/pedidos` | [desktop](vendedor/4a-pedidos-operacao/1-antes-desktop.png) | [desktop](vendedor/4a-pedidos-operacao/3-depois-desktop.png)                                                           |
| "Operar pedido" com seta e legenda                               | `components/fulfillment/operations.tsx` | `/pedidos` | [celular](vendedor/4a-pedidos-operacao/1-antes-mobile.png)  | [claro](vendedor/4a-pedidos-operacao/3-depois-claro.png) · [celular](vendedor/4a-pedidos-operacao/3-depois-mobile.png) |
| Legenda em "Todas as etapas"                                     | `components/fulfillment/operations.tsx` | `/pedidos` | [etapas](vendedor/4a-pedidos-operacao/1-antes-etapas.png)   | [etapas](vendedor/4a-pedidos-operacao/3-depois-etapas.png)                                                             |

**Ícones novos:** overdue (ClockCountdown), openOrder (ArrowRight). **Textos novos:** `ORDER_STATUS_HINTS`, `SHIPMENT_DELAY_HINTS`, `CONTROL_HINTS.orderStage`. **Componentes compartilhados:** nenhum alterado; `ToneStatus` (usado nas três áreas) ficou igual, a legenda e o relógio foram postos em volta dele só nesta lista.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; E2E 30/31 em paralelo (accessibility, fulfillment, label-import, order-page, pending-cost, reviews, support-links). A falha de `support-links.spec.ts` passou ao rodar sozinho (2/2): concorrência entre testes, não a mudança. Nenhum teste alterado.

**Seção seguinte:** Vendedor · 4b. Janela "Operar pedido" e página do pedido.

## Vendedor · 4b. Pedidos: operar pedido — 2026-10-18 · commit "feat(orders): clear actions in the shipment panel"

**Proposta escolhida: B (ações claras)**. Propostas: [página clicável](../propostas/vendedor/4b-pedidos-operar/index.html) · [A](vendedor/4b-pedidos-operar/2-proposta-a.png) · [B](vendedor/4b-pedidos-operar/2-proposta-b.png) · [C](vendedor/4b-pedidos-operar/2-proposta-c.png).

| Mudança                                                                                                                         | Arquivo                                                                  | Tela                                    | Antes                                                   | Depois                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Botão de etapa diz a ação ("Marcar como aceito", "… em separação", "… enviado", "… entregue") com legenda própria de cada etapa | `components/fulfillment/shipment-hints.tsx` (novo), `shipment-panel.tsx` | janela "Operar pedido" e `/pedidos/:id` | [janela](vendedor/4b-pedidos-operar/1-antes-janela.png) | [janela](vendedor/4b-pedidos-operar/3-depois-janela.png) |
| Ícone e legenda em Imprimir etiqueta, Imprimir ordem, Registrar ocorrência e Cancelar envio                                     | `components/fulfillment/shipment-panel.tsx`                              | mesmas                                  | [página](vendedor/4b-pedidos-operar/1-antes-pagina.png) | [claro](vendedor/4b-pedidos-operar/3-depois-claro.png)   |
| Ícone e legenda em Gerar novo link e Revogar acesso                                                                             | `components/fulfillment/order-dialog.tsx`                                | mesmas                                  | [página](vendedor/4b-pedidos-operar/1-antes-pagina.png) | [página](vendedor/4b-pedidos-operar/3-depois-pagina.png) |

**Ícones novos:** printLabel (Tag), printOrder (Printer), supplierLink (LinkSimple), revokeLink (LinkBreak), occurrence (WarningCircle), cancelShipment (XCircle), advanceStep (Check).

**Componente compartilhado (aprovado: "Só no vendedor agora"):** o painel de envio também aparece no painel do fornecedor e no link que ele recebe. Tudo depende de `actsAs === "reseller"`; para o fornecedor os botões ficam iguais (nomes das etapas, sem ícone e sem legenda). O `fulfillment.spec.ts` confere o lado do fornecedor ("Aceito", "Enviado") e passou.

**Divisão de arquivo:** os botões com legenda e o botão de etapa ficaram em `shipment-hints.tsx` para `shipment-panel.tsx` não passar de 500 linhas (ficou em 481).

**Teste ajustado (aprovado pelo usuário em 2026-10-18):** `e2e/fulfillment.spec.ts` linha 139, "Entregue" → "Marcar como entregue" na janela do vendedor. Depois: fulfillment, order-page, accessibility e support-links 23/23; label-import e supplier-panel-access verdes; Vitest web 853/853.

**Seção seguinte:** Vendedor · 4c. Pedidos: avaliações.

## Vendedor · 4c. Pedidos: avaliações — 2026-10-18 · commit "feat(orders): hints and an Editar label on reviews"

**Proposta escolhida: B (editar com texto)**. Propostas: [página clicável](../propostas/vendedor/4c-pedidos-avaliacoes/index.html) · [A](vendedor/4c-pedidos-avaliacoes/2-proposta-a.png) · [B](vendedor/4c-pedidos-avaliacoes/2-proposta-b.png) · [C](vendedor/4c-pedidos-avaliacoes/2-proposta-c.png).

| Mudança                                            | Arquivo                               | Tela                            | Antes                                                             | Depois                                                             |
| -------------------------------------------------- | ------------------------------------- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Legenda em "Avaliar"                               | `components/orders/review-action.tsx` | aba Avaliações e `/pedidos/:id` | [lista](vendedor/4c-pedidos-avaliacoes/1-antes-lista.png)         | [lista](vendedor/4c-pedidos-avaliacoes/3-depois-lista.png)         |
| Lápis de editar ganha a palavra "Editar" e legenda | `components/orders/review-action.tsx` | aba Avaliados e `/pedidos/:id`  | [avaliados](vendedor/4c-pedidos-avaliacoes/1-antes-avaliados.png) | [avaliados](vendedor/4c-pedidos-avaliacoes/3-depois-avaliados.png) |
| Legenda no status do pedido                        | `routes/_app/pedidos/index.tsx`       | aba Avaliações                  | [lista](vendedor/4c-pedidos-avaliacoes/1-antes-lista.png)         | [claro](vendedor/4c-pedidos-avaliacoes/3-depois-claro.png)         |

**Não alterado:** a janela de avaliar já tinha ícones, subtítulos em cada ponto e o significado de cada estrela ao passar o mouse.

**Ícones:** nenhum novo. **Textos novos:** `CONTROL_HINTS.rateSupplier` e `editReview`; reaproveitado `ORDER_STATUS_HINTS`.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; reviews, order-page e accessibility 12/12. Nenhum teste alterado (o nome acessível "Editar avaliação de …" continua igual).

**Seção seguinte:** Vendedor · 5. Lojas.

## Vendedor · 5. Lojas — 2026-10-19 · commit "feat(stores): dictionary icons and tooltips in the store menu"

**Proposta escolhida: A (ícones certos e legendas)**. Propostas: [página clicável](../propostas/vendedor/5-lojas/index.html) · [A](vendedor/5-lojas/2-proposta-a.png) · [B](vendedor/5-lojas/2-proposta-b.png) · [C](vendedor/5-lojas/2-proposta-c.png).

| Mudança                                                                                                                                                                              | Arquivo                                    | Tela     | Antes                                           | Depois                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------- | ----------------------------------------------- | ------------------------------------------------ |
| Menu ⋯: "Publicar produtos" com o avião (era a caixa do Catálogo), "Ver publicações" com o megafone (era a loja de Lojas), "Desconectar" com a tomada (era o ícone de Sair da conta) | `components/stores/store-menu.tsx`         | `/lojas` | [menu](vendedor/5-lojas/1-antes-menu.png)       | [menu](vendedor/5-lojas/3-depois-menu.png)       |
| Legenda no ⋯                                                                                                                                                                         | `components/stores/store-menu.tsx`         | `/lojas` | [desktop](vendedor/5-lojas/1-antes-desktop.png) | [desktop](vendedor/5-lojas/3-depois-desktop.png) |
| Legendas (sublinhado pontilhado) em "Última sincronização" e "Último aviso de pedido"                                                                                                | `components/stores/store-health.tsx`       | menu ⋯   | [menu](vendedor/5-lojas/1-antes-menu.png)       | [menu](vendedor/5-lojas/3-depois-menu.png)       |
| Ponto de status da loja: legenda do app no lugar do `title` nativo                                                                                                                   | `components/stores/store-status-badge.tsx` | `/lojas` | [desktop](vendedor/5-lojas/1-antes-desktop.png) | [claro](vendedor/5-lojas/3-depois-claro.png)     |
| Legenda em "Publicações" (cabeçalho)                                                                                                                                                 | `components/stores/store-list.tsx`         | `/lojas` | [desktop](vendedor/5-lojas/1-antes-desktop.png) | [desktop](vendedor/5-lojas/3-depois-desktop.png) |

**Ícones:** novo disconnectStore (Plugs); reaproveitados publish (PaperPlaneTilt) e listings (MegaphoneSimple). Fecha duas inconsistências da Etapa 0: "Desconectar loja" deixou de usar o ícone de sair da conta, e a loja deixou de servir para "Ver publicações".

**Compartilhado:** `store-health.tsx` também é usado pelo admin (`customer-stores.tsx`), mas só pela parte `StoreHealthLine`, que não mudou.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; store-attention, store-disconnect, store-health, store-supplier, stores-messages, accessibility e admin-store-supplier 12/12. Nenhum teste alterado.

**Seção seguinte:** Vendedor · 6. Financeiro.

## Vendedor · 6. Financeiro — 2026-10-19 · commit "feat(financials): plain words and app tooltips on the statement"

**Proposta escolhida: B (palavras mais claras)**. Propostas: [página clicável](../propostas/vendedor/6-financeiro/index.html) · [A](vendedor/6-financeiro/2-proposta-a.png) · [B](vendedor/6-financeiro/2-proposta-b.png) · [C](vendedor/6-financeiro/2-proposta-c.png).

| Mudança                                                                                                 | Arquivo                                     | Tela              | Antes                                                | Depois                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Os ⓘ do resumo usam a legenda única do site (300 ms, abre por toque); saiu o tooltip próprio desta tela | `components/financials/profit-summary.tsx`  | `/financeiro`     | [resumo](vendedor/6-financeiro/1-antes-resumo.png)   | [resumo](vendedor/6-financeiro/3-depois-resumo.png)   |
| "fora da receita" → "não conta como venda", com legenda                                                 | `components/financials/order-statement.tsx` | Extrato           | [extrato](vendedor/6-financeiro/1-antes-extrato.png) | [extrato](vendedor/6-financeiro/3-depois-extrato.png) |
| "N vendas válidas" com sublinhado pontilhado (a legenda já existia)                                     | `components/financials/order-statement.tsx` | Extrato           | [extrato](vendedor/6-financeiro/1-antes-extrato.png) | [claro](vendedor/6-financeiro/3-depois-claro.png)     |
| Setinha em cada linha do extrato, mostrando que abre o detalhe                                          | `components/financials/order-statement.tsx` | Extrato           | [extrato](vendedor/6-financeiro/1-antes-extrato.png) | [extrato](vendedor/6-financeiro/3-depois-extrato.png) |
| "Taxas" no detalhe do pedido com legenda                                                                | `components/financials/order-parts.tsx`     | detalhe do pedido | [pedido](vendedor/6-financeiro/1-antes-pedido.png)   | [pedido](vendedor/6-financeiro/3-depois-pedido.png)   |

**Divisão de arquivo:** o detalhe do pedido saiu para `components/financials/order-detail.tsx`; `order-statement.tsx` caiu de 585 para cerca de 565 linhas (a guarda só bloqueia crescer).

**Ajuste por teste visual:** a linha do extrato não ganhou legenda própria. Ela abria junto com a do termo e as duas se sobrepunham; a setinha já diz que a linha abre o detalhe.

**Textos novos:** `TERM_HINTS.notASale` e `fees`. **Glossário:** "não conta como venda" substitui "fora da receita".

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; reports, financeiro-scroll, pending-cost e accessibility 21/21. Nenhum teste alterado.

**Área do vendedor concluída.**

## Fornecedor · 1. Início — 2026-10-19 · commit "feat(supplier-panel): tab icons and home tooltips"

**Proposta escolhida: A (padrão do site)**. Propostas: [página clicável](../propostas/fornecedor/1-inicio/index.html) · [A](fornecedor/1-inicio/2-proposta-a.png) · [B](fornecedor/1-inicio/2-proposta-b.png) · [C](fornecedor/1-inicio/2-proposta-c.png).

| Mudança                                                                                                  | Arquivo                                                | Tela                         | Antes                                              | Depois                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Abas do fornecedor com ícone (a partir de 1440 px) e legenda                                             | `components/icons/action-icons.ts` (`NAV_TAB_ICONS`)   | todas as telas do fornecedor | [desktop](fornecedor/1-inicio/1-antes-desktop.png) | [legenda da aba](fornecedor/1-inicio/3-depois-legenda-aba.png) · [celular](fornecedor/1-inicio/3-depois-mobile-menu.png) |
| Legenda no selo da loja do pedido                                                                        | `components/supplier-panel/home/home-order-rows.tsx`   | `/fornecedor/painel`         | [desktop](fornecedor/1-inicio/1-antes-desktop.png) | [desktop](fornecedor/1-inicio/3-depois-desktop.png)                                                                      |
| "Reprovado" com sublinhado pontilhado e legenda                                                          | `components/supplier-panel/home/home-catalog-rows.tsx` | `/fornecedor/painel`         | [desktop](fornecedor/1-inicio/1-antes-desktop.png) | [desktop](fornecedor/1-inicio/3-depois-desktop.png)                                                                      |
| Legenda no nível e em cada métrica (com a meta, lida das regras de desempenho); seta em "Ver desempenho" | `components/supplier-panel/home/health-strip.tsx`      | `/fornecedor/painel`         | [desktop](fornecedor/1-inicio/1-antes-desktop.png) | [desktop](fornecedor/1-inicio/3-depois-desktop.png) · [claro](fornecedor/1-inicio/3-depois-claro.png)                    |

**Ícones (decisão do usuário: "ícones próprios"):** Início = casa (supplierHome, fila de tarefas, diferente da Visão geral); Pedidos = sacola (mesma função do vendedor); Produtos = caixa (mesmo ícone do Catálogo, lista de produtos); Importar = arquivo com seta (importProducts); Desempenho = medidor (performance); Marca = paleta (brand). "Ver desempenho" reaproveita a seta de openOrder.

**Não alterado:** "Revisar código de barras (gtin)" vem do nome do campo na análise de produto, compartilhado com a área admin; fica para a vez do admin.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest web 853/853; supplier-panel-access e accessibility 8/8. Nenhum teste alterado.

**Seção seguinte:** Fornecedor · 2. Pedidos.

## Fornecedor · 2. Pedidos — 2026-10-19 · commit "feat(supplier-panel): one deadline icon and the shipment panel for suppliers"

**Proposta escolhida: A (mesmo padrão do revendedor)**. Propostas: [página clicável](../propostas/fornecedor/2-pedidos/index.html) · [A](fornecedor/2-pedidos/2-proposta-a.png) · [B](fornecedor/2-pedidos/2-proposta-b.png) · [C](fornecedor/2-pedidos/2-proposta-c.png).

| Mudança                                                                                                                               | Arquivo                                                                               | Tela                                          | Antes                                             | Depois                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Prazo vencido com o relógio de contagem (era "!"; o revendedor já usava o relógio) e prazo a vencer com relógio; legenda em cada selo | `components/supplier-panel/orders/countdown-badge.tsx`, `home/home-order-rows.tsx`    | `/fornecedor/painel/pedidos` e Início         | [lista](fornecedor/2-pedidos/1-antes-lista.png)   | [lista](fornecedor/2-pedidos/3-depois-lista.png) · [Início](fornecedor/2-pedidos/3-depois-inicio-prazo.png) |
| Busca "SKU" → "código"                                                                                                                | `components/supplier-panel/orders/order-filters.tsx`                                  | Pedidos                                       | [lista](fornecedor/2-pedidos/1-antes-lista.png)   | [lista](fornecedor/2-pedidos/3-depois-lista.png)                                                            |
| Legenda nos botões da linha (Aceitar, Separar, Marcar pronto, Despachar, Ver pedido) e na caixinha                                    | `components/supplier-panel/orders/order-row-parts.tsx`                                | Pedidos                                       | [lista](fornecedor/2-pedidos/1-antes-lista.png)   | [claro](fornecedor/2-pedidos/3-depois-claro.png)                                                            |
| Janela do pedido (lado do fornecedor): "Marcar como …", ícones e legendas no ponto de vista do fornecedor                             | `components/fulfillment/shipment-hints.tsx`, `shipment-panel.tsx`, `order-dialog.tsx` | janela do pedido e link enviado ao fornecedor | [janela](fornecedor/2-pedidos/1-antes-janela.png) | [janela](fornecedor/2-pedidos/3-depois-janela.png)                                                          |

**Ícones:** novo deadline (Clock); reaproveitados overdue (ClockCountdown), printLabel, printOrder, occurrence, cancelShipment, advanceStep. Fecha a pendência da 4b ("só no vendedor agora").

**Componentes compartilhados (aprovado: "Sim, nas duas telas"):** o selo de prazo vale em Pedidos e no Início; o painel de envio vale para revendedor e fornecedor, com legendas próprias de cada um.

**Não alterado:** "Prazo vencido" já tem a explicação escrita logo abaixo; e a aba "Com problema" usa o componente de abas compartilhado (mesma decisão da 3a).

**Teste ajustado (aprovado pelo usuário em 2026-10-19):** `e2e/fulfillment.spec.ts` linhas 99, 110, 117, 129, 299 e 418: os botões do fornecedor passaram a ser "Marcar como aceito / em separação / pronto para envio / enviado / entregue". Depois: fulfillment 11/11; order-page, support-links, label-import, supplier-panel-access e accessibility verdes; Vitest web 853/853.

**Seção seguinte:** Fornecedor · 3a. Produtos: lista.

## Fornecedor · 3a. Produtos: lista — 2026-10-19 · commit "feat(supplier-panel): plain words and hints on the product list"

**Proposta escolhida: A (só legendas e termos claros)**. Propostas: [página clicável](../propostas/fornecedor/3a-produtos-lista/index.html) · [A](fornecedor/3a-produtos-lista/2-proposta-a.png) · [B](fornecedor/3a-produtos-lista/2-proposta-b.png) · [C](fornecedor/3a-produtos-lista/2-proposta-c.png).

| Mudança                                                                                   | Arquivo                                                                                   | Tela                                  | Antes                                                                                                                    | Depois                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| "SKU" → "Código" no cabeçalho, na busca e na ordenação do celular                         | `components/supplier-panel/catalog/catalog-product-table.tsx`, `catalog-product-list.tsx` | `/fornecedor/painel/produtos`         | [desktop](fornecedor/3a-produtos-lista/1-antes-desktop.png) · [celular](fornecedor/3a-produtos-lista/1-antes-mobile.png) | [desktop](fornecedor/3a-produtos-lista/3-depois-desktop.png) · [celular](fornecedor/3a-produtos-lista/3-depois-mobile.png) |
| Legenda em "Completude" (sublinhado pontilhado)                                           | `catalog-product-table.tsx`                                                               | Produtos                              | [desktop](fornecedor/3a-produtos-lista/1-antes-desktop.png)                                                              | [completude](fornecedor/3a-produtos-lista/3-depois-completude.png)                                                         |
| Legenda nos selos de completude ("impedem publicar", "Pode melhorar", "Anúncio completo") | `components/supplier-panel/catalog/review-status.tsx`                                     | Produtos, cadastro e revisão do admin | [desktop](fornecedor/3a-produtos-lista/1-antes-desktop.png)                                                              | [desktop](fornecedor/3a-produtos-lista/3-depois-desktop.png)                                                               |
| Legenda em "Corrigir", "Editar" e "Cadastrar produto" (ícone do dicionário)               | `catalog-product-table.tsx`, `catalog-product-list.tsx`                                   | Produtos                              | [desktop](fornecedor/3a-produtos-lista/1-antes-desktop.png)                                                              | [claro](fornecedor/3a-produtos-lista/3-depois-claro.png)                                                                   |

**Ícones:** novo createProduct (Plus, o mesmo que já estava no botão, agora vindo do dicionário). Botões das linhas seguem só com texto.

**Componente compartilhado (aprovado: "Em todas"):** o selo de completude ganhou a legenda também no cadastro (3b) e na revisão de produtos do admin.

**Não alterado:** "SKU" no formulário de cadastro e no resumo fica para a 3b; as abas usam o componente compartilhado.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest supplier-panel e admin-product-review 11/11; e2e supplier-product-review, supplier-product-images, supplier-brand e admin-suppliers 7/7. Nenhum teste alterado.

**Seção seguinte:** Fornecedor · 3b. Produtos: cadastro.

## Fornecedor · 3b. Produtos: cadastro — 2026-10-19 · commit "feat(supplier-panel): hints and a cover star on the product form"

**Proposta escolhida: B (capa com estrela)**. Propostas: [página clicável](../propostas/fornecedor/3b-produtos-cadastro/index.html) · [A](fornecedor/3b-produtos-cadastro/2-proposta-a.png) · [B](fornecedor/3b-produtos-cadastro/2-proposta-b.png) · [C](fornecedor/3b-produtos-cadastro/2-proposta-c.png).

| Mudança                                                                                                                          | Arquivo                                                                                           | Tela                         | Antes                                                                                                                                  | Depois                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão de capa: seta para cima → estrela (setCover); lixeira do dicionário (removeImage); legenda nos dois                        | `components/supplier-panel/catalog/step-images.tsx`                                               | passo Imagens                | [desktop](fornecedor/3b-produtos-cadastro/1-antes-imagens.png) · [celular](fornecedor/3b-produtos-cadastro/1-antes-mobile-imagens.png) | [desktop](fornecedor/3b-produtos-cadastro/3-depois-imagens.png) · [celular](fornecedor/3b-produtos-cadastro/3-depois-mobile.png) · [claro](fornecedor/3b-produtos-cadastro/3-depois-claro.png) |
| Legenda no número vermelho de cada etapa                                                                                         | `components/supplier-panel/catalog/form-stepper.tsx`                                              | todas as etapas              | [revisão](fornecedor/3b-produtos-cadastro/1-antes-revisao.png)                                                                         | [etapa](fornecedor/3b-produtos-cadastro/3-depois-etapa.png)                                                                                                                                    |
| Legenda em "Impede publicar" e "Melhora o anúncio"                                                                               | `components/supplier-panel/catalog/completeness-meter.tsx`                                        | cadastro e revisão do admin  | [revisão](fornecedor/3b-produtos-cadastro/1-antes-revisao.png)                                                                         | [completude](fornecedor/3b-produtos-cadastro/3-depois-completude.png)                                                                                                                          |
| "SKU" → "Código" no formulário, na revisão (com legenda) e em "Informe o código para salvar"; legenda em "Salvamento automático" | `components/supplier-panel/catalog/step-details.tsx`, `step-review.tsx`, `autosave-indicator.tsx` | Dados obrigatórios e Revisão | [dados](fornecedor/3b-produtos-cadastro/1-antes-dados.png)                                                                             | [dados](fornecedor/3b-produtos-cadastro/3-depois-dados.png) · [revisão](fornecedor/3b-produtos-cadastro/3-depois-revisao.png)                                                                  |
| "Enviar para análise" desligado explica por quê (DisabledHint)                                                                   | `components/supplier-panel/catalog/step-review.tsx`                                               | Revisão                      | [revisão](fornecedor/3b-produtos-cadastro/1-antes-revisao.png)                                                                         | [revisão](fornecedor/3b-produtos-cadastro/3-depois-revisao.png)                                                                                                                                |

**Ícones:** novos setCover (Star) e removeImage (Trash). A estrela das avaliações de fornecedor é nota, não ação; aqui é a única ação com estrela.

**Componente compartilhado (aprovado: "Em todas"):** as legendas do quadro de Completude valem também na revisão de produtos do admin.

**Testes:** typecheck, oxlint e Prettier limpos; Vitest supplier-panel, admin-product-review e features/supplier-panel 73/73; e2e supplier-product-review, supplier-product-images, admin-suppliers e csv-attributes 6/6. Nenhum teste alterado.

**Seção seguinte:** Fornecedor · 4. Importar.

## Fornecedor · 4. Importar — 2026-10-19 · commit "feat(supplier-panel): hints and plain words on the spreadsheet import"

**Proposta escolhida: A (legendas e "código")**. Propostas: [página clicável](../propostas/fornecedor/4-importar/index.html) · [A](fornecedor/4-importar/2-proposta-a.png) · [B](fornecedor/4-importar/2-proposta-b.png) · [C](fornecedor/4-importar/2-proposta-c.png).

| Mudança                                                                                       | Arquivo                                                                                      | Tela                          | Antes                                                | Depois                                                                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Legenda em "Baixar modelo" e "Baixar guia"; "pelo SKU" → "pelo código"                        | `components/supplier-panel/import/import-template-panel.tsx`                                 | `/fornecedor/painel/importar` | [desktop](fornecedor/4-importar/1-antes-desktop.png) | [desktop](fornecedor/4-importar/3-depois-desktop.png)                                                    |
| Legenda em "Com erro" e "Baixar erros"; "Importar" desligado explica que falta marcar a caixa | `components/supplier-panel/import/import-preview-summary.tsx`, `supplier-product-import.tsx` | prévia e fim da importação    | [prévia](fornecedor/4-importar/1-antes-previa.png)   | [prévia](fornecedor/4-importar/3-depois-previa.png) · [claro](fornecedor/4-importar/3-depois-claro.png)  |
| Tabela de erros: "SKU" → "Código", "sem SKU" → "sem código"                                   | `components/supplier-panel/import/import-issue-list.tsx`                                     | prévia                        | [prévia](fornecedor/4-importar/1-antes-previa.png)   | [erros](fornecedor/4-importar/3-depois-erros.png) · [celular](fornecedor/4-importar/3-depois-mobile.png) |
| Resumo final: "atualizados pelo código"                                                       | `features/supplier-panel/import/import-wording.ts`                                           | confirmação                   | —                                                    | —                                                                                                        |
| Ícones de baixar e de escolher arquivo vindos do dicionário                                   | `import-drop-zone.tsx` e os acima                                                            | Importar                      | —                                                    | —                                                                                                        |

**Ícones:** novo downloadFile (DownloadSimple, para arquivos que a tela gera); o de escolher arquivo reaproveita importProducts (o mesmo da aba Importar).

**Não alterado:** os nomes das colunas da planilha (`sku`, `titulo`…) são o formato do arquivo e continuam iguais.

**Teste ajustado (aprovado pelo usuário em 2026-10-19):** `features/supplier-panel/import/import-wording.test.ts` linha 21 ("atualizados pelo código"). Depois: Vitest supplier-panel 73/73; e2e supplier-panel-access e accessibility 6/6; typecheck, oxlint e Prettier limpos.

**Próxima seção:** Fornecedor · 5. Desempenho (`/fornecedor/painel/desempenho`).
