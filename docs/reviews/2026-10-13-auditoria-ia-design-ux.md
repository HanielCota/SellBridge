# Auditoria: vícios de IA, design, interface e experiência

Data: 2026-10-13 · Branch: `feat/client-phase-1-c` (sobre `2936750`) · Feita no chat paralelo C, a pedido do usuário, antes do item 09.

Como foi feita: três revisões somente leitura do código (pacotes e worker; `apps/web`; design, UI e UX rota a rota) e capturas de 23 telas em 1440×900 escuro e 390×844 claro, com medição de rolagem lateral, botões sem nome e alvos pequenos.

## Veredito

A base é boa: o lint cobra as regras da casa e passa limpo (sem `else`, `.then`, `any`, `!.` nem casts inseguros), uma só biblioteca de ícones (Phosphor), nada de emojis ou gradientes, `motion-reduce` nas animações, rótulos reais nos campos, `role="alert"` nos erros e `alt` nas imagens. Os problemas são de **deriva**: componentes canônicos criados e depois ignorados, código morto e uma área (envio e Operação de pedidos, link do fornecedor) que foge do padrão.

## 1. Vícios de IA

Corrigidos no commit `refactor: remove AI vices` (lista completa no histórico de `execucao-progresso-c.md`). Ficaram para itens próprios:

- Regra "pedido cancelado ou devolvido não conta como venda" repetida em 5 lugares (`shared/domain/finance.ts`, `stock-reservation.ts`, `schemas/financials.ts`, `sql/counted-orders.ts`, `supplier-reviews.ts`) e `FinanceOrderStatus` redeclarando `OrderStatus`: **item 09**.
- `listing_targets.sync_error` gravado e nunca lido: **item 23** (mostrar "sincronizando…" e o erro).
- `PublishOptions` opcional no conector do ML (o guarda contra duplicado pode ser pulado): **item 13**.
- Paginação da Operação fora do `toPaginated` (`fulfillment.ts`): junto com a tela de Operação (seção 3).

## 2. Design

| #   | Achado                                                                                                                                                             | Onde                                                                                                                                                                 | Severidade |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| D-1 | Sem tokens de sucesso, aviso e informação: ~30 arquivos com `emerald-*`, `amber-*`, `sky-*` crus e pares claro/escuro feitos à mão                                 | `data/tone-status.tsx:6-9`, `listings/run-state-style.ts`, `admin/issue-style.ts`, `suppliers/reputation.tsx`, `orders/review-dialog.tsx`, `routes/_app/pedidos.tsx` | alta       |
| D-2 | Tamanhos fora da escala: `text-[44px]`/`[56px]`, `[34px]`, `[30px]` duplicado, `[15px]` (= `text-subhead`), `[11px]` (= `text-caption`); ~20 `text-base/lg/xl/3xl` | `reports/dashboard-hero.tsx`, `kpi-tiles.tsx`, `admin/chamados/metricas.tsx`, `_auth/route.tsx`, `financials/profit-summary.tsx`, `reports/chart-kind-menu.tsx`      | média      |
| D-3 | Raios e sombras avulsos; brilho decorativo na estrela; `ErrorState` com `rounded-xl border` ao lado do `EmptyState` em `surface-card rounded-3xl`                  | `pedidos.tsx:172`, `bulk-publish-dialog.tsx:515`, `shipment-panel.tsx:62`, `feedback/error-state.tsx:13`                                                             | baixa      |
| D-4 | Peso `duotone` de ícone só no admin e nas listagens                                                                                                                | 6 arquivos                                                                                                                                                           | baixa      |
| D-5 | Chips de status com paleta repetida em 5 lugares e trilho de linha do tempo copiado                                                                                | `store-status-badge.tsx`, `run-state-style.ts`, `issue-style.ts`, `customer-journey-board.tsx`, `customer-timeline.tsx` × `shipment-panel.tsx`                       | média      |

## 3. Interface

| #    | Achado                                                                                                                                             | Onde                                                                                                                           | Severidade |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| U-1  | Rolagem lateral no celular (390 px): Publicações 32 px (abas de filtro estouram), Métricas do suporte 132 px (tabela da equipe corta "Satisfação") | `publicacoes/index.tsx`, `admin/chamados/metricas.tsx`                                                                         | alta       |
| U-2  | Skeleton com outra forma (V17): Painel com outra grade; bloco único `h-64`/`h-96` em 8 telas; skeletons com `aria-label` em `div` sem `role`       | `dashboard.tsx:139-159`, `admin/chamados/$ticketId.tsx`, `admin/clientes/*`, `suporte/index.tsx`, `fulfillment/operations.tsx` | alta       |
| U-3  | Pedidos: abas feitas com dois `Button`, sem semântica de abas e perdidas ao recarregar                                                             | `pedidos.tsx:61-73`                                                                                                            | alta       |
| U-4  | Operação: `<select>` nativo, botão "Buscar" (as irmãs buscam sozinhas), cartão vazio desenhado quando não há pedidos, filtros fora da URL          | `fulfillment/operations.tsx`                                                                                                   | média      |
| U-5  | Assinatura sem `PageHeader`, `<main>` dentro de `<main>`, título `text-3xl`, sem skeleton                                                          | `billing/billing-page.tsx:136-139`                                                                                             | média      |
| U-6  | Admin › Fornecedores da geração antiga: "Voltar" sublinhado, `<select>` nativos                                                                    | `admin-suppliers/supplier-detail.tsx:23`, `coverage-fields.tsx:21`, `product-form.tsx:71`                                      | média      |
| U-7  | "Voltar" de detalhe feito de 4 jeitos; `PageHeader` sem espaço para ele                                                                            | `suporte/$ticketId.tsx`, `admin/chamados/$ticketId.tsx`, `admin/clientes/$userId.tsx`, item U-6                                | média      |
| U-8  | Alvos de toque abaixo de 44 px: botão padrão 36 px, `sm` 32 px, `xs` 28 px                                                                         | `ui/button.tsx:24-31`, `price-receipt.tsx`, `copy-button.tsx`, `profit-summary.tsx:57`                                         | média      |
| U-9  | Link do fornecedor: "Carregando ordem…" em texto, "Pedido X" solto, aviso de bloqueio sem `role="alert"`, sem marca                                | `routes/fornecedor/pedido/$token.tsx:46-53`                                                                                    | média      |
| U-10 | Métricas duplicam o indicador do Painel e usam `gap-3`; vazios em `<p>`                                                                            | `admin/chamados/metricas.tsx:40-52,86,148`                                                                                     | baixa      |

## 4. Experiência e acessibilidade

| #   | Achado                                                                           | Onde                                                                                                                                                                                                             | Severidade |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| X-1 | "Cancelar envio" roda sem confirmação, inclusive no link público do fornecedor   | `fulfillment/shipment-panel.tsx:141-147`                                                                                                                                                                         | alta       |
| X-2 | Estados vazios sem ação (V18)                                                    | `catalogo.tsx:258`, `fornecedores/$supplierId.tsx:271`, `admin/chamados/index.tsx:361`, `admin-suppliers/supplier-index.tsx:74`, `financeiro.tsx:283`, `pedidos.tsx:251`, `admin-suppliers/product-list.tsx:122` | média      |
| X-3 | Botões desabilitados sem explicar por quê (exigem a observação preenchida)       | `shipment-panel.tsx:135,143`                                                                                                                                                                                     | média      |
| X-4 | "Reprocessar" com cor de perigo                                                  | `listings/listing-card.tsx:77`                                                                                                                                                                                   | baixa      |
| X-5 | Mesmo painel com dois nomes: "Painel de vendas" no título, "Visão geral" no menu | `dashboard-hero.tsx:8`, `dashboard.tsx:29`                                                                                                                                                                       | baixa      |
| X-6 | `ErrorState` mostra a mensagem do erro crua (pode ser técnica)                   | `feedback/error-state.tsx`                                                                                                                                                                                       | baixa      |
| X-7 | Anel de foco em 7 variações; campo de % sem indicador de foco                    | `bulk-publish-dialog.tsx:246`, vários                                                                                                                                                                            | média      |
| X-8 | Contraste baixo: aba inativa `text-foreground/60`, ícone `muted-foreground/70`   | `ui/tabs.tsx:58`, `profit-summary.tsx:57`                                                                                                                                                                        | média      |

## Prioridade sugerida para as correções de tela

X-1 → U-1 → U-3/U-4 → D-1 → U-2 → U-8 → U-5/U-6/U-7/U-9 → X-2 → X-7. Cada uma é mudança visível: segue o fluxo do prompt de execução, com ficha D0 e capturas.
