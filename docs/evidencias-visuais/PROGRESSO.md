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

**Próxima seção:** Vendedor · 4c. Pedidos: avaliações.
