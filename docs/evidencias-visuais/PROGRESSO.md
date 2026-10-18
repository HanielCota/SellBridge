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

**Próxima seção:** Vendedor · 1. Visão geral (`/dashboard`).
